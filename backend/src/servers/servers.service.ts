import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { InstanceLiveness } from '../monitoring/interfaces/liveness-target.interface';
import { MonitoringService } from '../monitoring/monitoring.service';
import { PrismaService } from '../prisma/prisma.service';
import { ServerDetail } from './interfaces/server-detail.interface';
import { ServerHealth, ServerView } from './interfaces/server-view.interface';
import { hostHealth } from './server-health';
import { toInstanceView, toServerView } from './servers.mapper';

/**
 * Reads the cache. Never touches SSH: refreshing it belongs to
 * InventoryService. Liveness is the one exception — Prometheus is queried on
 * every request rather than cached, because it is already the fast, live
 * source `unknown` is supposed to be resolved against.
 */
@Injectable()
export class ServersService {
  private readonly logger = new Logger(ServersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly monitoring: MonitoringService,
  ) {}

  async findAll(): Promise<ServerView[]> {
    const servers = await this.prisma.server.findMany({
      orderBy: { name: 'asc' },
      include: { instances: { select: { name: true, state: true } } },
    });
    const resolved = await Promise.all(
      servers.map(async (server) => ({
        server,
        instances: await this.withLiveness(server, server.instances),
        health: await this.hostHealthOf(server),
      })),
    );
    return resolved.map(({ server, instances, health }) =>
      toServerView(server, instances, health),
    );
  }

  async findOne(name: string): Promise<ServerDetail> {
    const server = await this.prisma.server.findUnique({
      where: { name },
      include: { instances: { orderBy: { name: 'asc' } } },
    });
    if (!server) throw new NotFoundException(`Unknown server '${name}'`);

    const instances = await this.withLiveness(server, server.instances);
    return {
      ...toServerView(server, instances, await this.hostHealthOf(server)),
      instances: instances.map(toInstanceView),
    };
  }

  /**
   * `undefined` for a stack server, leaving the SSH-derived health alone. A
   * host server is never read over SSH, so Prometheus answers instead; if it
   * cannot be reached the row falls back to `never read` rather than claiming
   * an outage it has not observed.
   */
  private async hostHealthOf(server: {
    kind: string;
    tailnetIp: string;
    nodePort: number;
  }): Promise<ServerHealth | undefined> {
    if (server.kind !== 'host') return undefined;

    try {
      return hostHealth(await this.monitoring.targetUp(`${server.tailnetIp}:${server.nodePort}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Health unavailable for '${server.kind}' server: ${message}`);
      return hostHealth(null);
    }
  }

  /**
   * SSH answers `unknown` because the reading account cannot see docker —
   * that is the normal case, not a partial failure. Only that value is
   * resolved against Prometheus; a categorical state like `disabled` or
   * `not deployed` describes intent, not liveness, and is left alone. If
   * Prometheus itself does not answer, the instances are returned unchanged.
   */
  private async withLiveness<T extends { name: string; state: string | null }>(
    server: { tailnetIp: string; cadvisorPort: number },
    instances: T[],
  ): Promise<T[]> {
    if (instances.length === 0) return instances;

    let liveness: InstanceLiveness[];
    try {
      liveness = await this.monitoring.liveness(
        { tailnetIp: server.tailnetIp, cadvisorPort: server.cadvisorPort },
        instances.map((i) => i.name),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Liveness unavailable: ${message}`);
      return instances;
    }

    const live = new Map(liveness.map((l) => [l.name, l.state]));
    return instances.map((instance) =>
      instance.state === 'unknown' && live.has(instance.name)
        ? { ...instance, state: live.get(instance.name)! }
        : instance,
    );
  }
}
