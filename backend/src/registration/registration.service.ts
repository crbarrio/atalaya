import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ServerView } from '../servers/interfaces/server-view.interface';
import { toServerView } from '../servers/servers.mapper';
import { RegisterServerRequest } from './interfaces/register-server.interface';
import { resolveTailnetIp } from './resolve-tailnet-ip';
import { TargetsService } from './targets.service';

@Injectable()
export class RegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly targets: TargetsService,
  ) {}

  /**
   * Only the registry row and the regenerated target files — this never
   * touches the server itself. See *Server registration* in PLAN.md: atalaya
   * generates and verifies, a person runs the artifact.
   *
   * `host` is the tailnet IP, always: SSH stays on the tailnet, which is
   * where the key is restricted to work from — same convention the
   * `marsella-test` seed established.
   */
  async register(request: RegisterServerRequest): Promise<ServerView> {
    const existing = await this.prisma.server.findUnique({ where: { name: request.name } });
    if (existing) throw new ConflictException(`'${request.name}' is already registered`);

    const tailnetIp = request.tailnetIp ?? (await resolveTailnetIp(request.name));
    if (!tailnetIp) {
      throw new UnprocessableEntityException(
        `'${request.name}' does not resolve to a tailnet address — is the machine already joined to the tailnet?`,
      );
    }

    const server = await this.prisma.server.create({
      data: {
        name: request.name,
        host: tailnetIp,
        tailnetIp,
        nodePort: request.nodePort ?? 9100,
        cadvisorPort: request.cadvisorPort ?? 8080,
      },
    });

    await this.targets.regenerate();
    await this.targets.regenerateDomains();

    return toServerView(server, []);
  }

  /**
   * Drops the row and everything keyed on it (instances, provision checks
   * cascade; incidents keep their history with `serverId` set null — an
   * alert that already fired is not undone by removing the server from the
   * registry). Never touches the machine itself, same as `register`.
   */
  async deregister(name: string): Promise<void> {
    const existing = await this.prisma.server.findUnique({ where: { name } });
    if (!existing) throw new NotFoundException(`'${name}' is not registered`);

    await this.prisma.server.delete({ where: { name } });
    await this.targets.regenerate();
    await this.targets.regenerateDomains();
  }
}
