import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { TargetsService } from './targets.service';

/**
 * Registers the machine atalaya itself runs on, so it is monitored like any
 * other — but as `kind: 'host'`: no `stack`, so no SSH, no inventory, no
 * backups, and health from Prometheus instead.
 *
 * Registration is not a UI flow here: this machine's collectors are installed
 * by the same compose file that starts atalaya, so the row that describes them
 * belongs to the same step. Configured from `SELF_MONITOR_*`, set in
 * infra/homeserver/docker-compose.yml and absent in development.
 *
 * `127.0.0.1` rather than the tailnet IP: Prometheus shares this host's
 * network namespace and reaches the collectors there, and binding them to the
 * tailnet would expose them for nothing.
 */
@Injectable()
export class SelfRegisterService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SelfRegisterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly targets: TargetsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const name = process.env.SELF_MONITOR_NAME?.trim();
    if (!name) return;

    const data = {
      kind: 'host',
      host: '127.0.0.1',
      tailnetIp: '127.0.0.1',
      nodePort: port('SELF_MONITOR_NODE_PORT', 9100),
      cadvisorPort: port('SELF_MONITOR_CADVISOR_PORT', 8081),
    };

    try {
      // Upsert, not create: this runs on every boot, and the ports may have
      // changed. `name` is what the operator would rename, so it stays the key.
      await this.prisma.server.upsert({
        where: { name },
        create: { name, ...data },
        update: data,
      });
      await this.targets.regenerate();
      this.logger.log(`Monitoring this machine as '${name}'`);
    } catch (error) {
      // Never fatal: the panel is still worth having without its own metrics.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Could not register this machine as '${name}': ${message}`);
    }
  }
}

function port(variable: string, fallback: number): number {
  const parsed = Number(process.env[variable]);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : fallback;
}
