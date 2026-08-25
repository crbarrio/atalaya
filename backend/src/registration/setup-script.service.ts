import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { PrismaService } from '../prisma/prisma.service';
import { detectTailnetIp } from './detect-tailnet-ip';

// Fixed, not an env var: `infra/homeserver/atalaya/backend.Dockerfile` always
// copies the template to this exact path in production. In development the
// repo layout itself is the constant — computed from this file's own
// compiled location, `dist/src/registration/`, rather than the working
// directory a command happened to run from (Nest's --watch runs from `dist/`
// too, the same as production, just without a container around it).
const TEMPLATE_PATH =
  process.env.NODE_ENV === 'production'
    ? '/app/setup-server.sh'
    : join(__dirname, '../../../../infra/fleet/server-setup/setup-server.sh');

/**
 * Personalises `setup-server.sh` for one server: the IP, the labels, the
 * ports are already inside the download — see *Server registration* in
 * PLAN.md. Done by replacing the script's own `--- Defaults ---` assignments
 * rather than appending flags, so running it needs no arguments at all.
 */
@Injectable()
export class SetupScriptService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(name: string): Promise<string> {
    const server = await this.prisma.server.findUnique({ where: { name } });
    if (!server) throw new NotFoundException(`Unknown server '${name}'`);

    const template = await this.readTemplate();
    const publicKey = await this.readPublicKey();

    const fromIp = detectTailnetIp();
    if (!fromIp) throw new InternalServerErrorException('Could not detect this machine\'s own tailnet IP');

    let personalised = template;
    personalised = this.replaceDefault(personalised, 'TAILNET_IP=""', `TAILNET_IP="${server.tailnetIp}"`);
    personalised = this.replaceDefault(personalised, 'NODE_PORT=9100', `NODE_PORT=${server.nodePort}`);
    personalised = this.replaceDefault(
      personalised,
      'CADVISOR_PORT=8080',
      `CADVISOR_PORT=${server.cadvisorPort}`,
    );
    // `stackPath` is the path to the `stack` executable (.../stack/stack), read
    // over SSH by InventoryReader. `--stack-dir` wants its containing directory.
    personalised = this.replaceDefault(
      personalised,
      'STACK_DIR="/home/ubuntu/docker/stack"',
      `STACK_DIR="${dirname(server.stackPath)}"`,
    );
    personalised = this.replaceDefault(
      personalised,
      'ATALAYA_USER="atalaya"',
      `ATALAYA_USER="${server.sshUser}"`,
    );
    personalised = this.replaceDefault(personalised, 'ATALAYA_KEY=""', `ATALAYA_KEY="${publicKey}"`);
    personalised = this.replaceDefault(personalised, 'ATALAYA_FROM=""', `ATALAYA_FROM="${fromIp}"`);

    return personalised;
  }

  /** Fails loudly rather than silently no-op'ing when the template's defaults have drifted. */
  private replaceDefault(template: string, original: string, replacement: string): string {
    if (!template.includes(original)) {
      throw new InternalServerErrorException(
        `setup-server.sh no longer contains the expected default '${original}' — update SetupScriptService`,
      );
    }
    return template.replace(original, replacement);
  }

  private async readTemplate(): Promise<string> {
    try {
      return await readFile(TEMPLATE_PATH, 'utf8');
    } catch {
      throw new InternalServerErrorException(
        `Cannot read the setup script template at ${TEMPLATE_PATH}`,
      );
    }
  }

  private async readPublicKey(): Promise<string> {
    const keyPath = process.env.SSH_KEY_PATH;
    if (!keyPath) throw new InternalServerErrorException('SSH_KEY_PATH is not set');
    try {
      return (await readFile(`${keyPath}.pub`, 'utf8')).trim();
    } catch {
      throw new InternalServerErrorException(`Cannot read the public key at ${keyPath}.pub`);
    }
  }
}
