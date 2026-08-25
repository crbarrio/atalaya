import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { TargetsService } from '../registration/targets.service';
import { RefreshResult } from './interfaces/refresh-result.interface';
import { InventoryReader } from './inventory.reader';
import { InventoryRepository } from './inventory.repository';

/**
 * Orchestrates a refresh: read, then store. The reading and the storing each
 * live in their own class; this one only decides the order and what a failure
 * means.
 */
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reader: InventoryReader,
    private readonly repository: InventoryRepository,
    private readonly targets: TargetsService,
  ) {}

  /**
   * A failure is recorded, not thrown: a machine that is down must degrade the
   * panel with a reason rather than empty it. The cached instances are left
   * alone — last known state with a visible age beats a blank screen.
   */
  async refreshServer(name: string): Promise<RefreshResult> {
    const server = await this.prisma.server.findUnique({ where: { name } });
    if (!server) throw new NotFoundException(`Unknown server '${name}'`);

    // Nothing to read: a host server runs no `stack`. Reported as a success
    // with no instances, because there is no failure here to record.
    if (server.kind === 'host') return { server: name, ok: true, instances: 0 };

    try {
      const inventory = await this.reader.read(server);
      await this.repository.save(server.id, inventory);
      // Domains change with every deploy that adds/drops one — not just on
      // register/deregister, so the certificate probe list has to follow
      // every refresh, not only the rarer registry events.
      await this.targets.regenerateDomains();
      return { server: name, ok: true, instances: inventory.instances.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Refresh failed for ${name}: ${message}`);
      await this.repository.saveFailure(server.id, message);
      return { server: name, ok: false, error: message };
    }
  }

  /** Every enabled stack server. One failure does not stop the rest. */
  async refreshAll(): Promise<RefreshResult[]> {
    const servers = await this.prisma.server.findMany({
      where: { enabled: true, kind: 'stack' },
      select: { name: true },
      orderBy: { name: 'asc' },
    });

    const results: RefreshResult[] = [];
    for (const { name } of servers) {
      results.push(await this.refreshServer(name));
    }
    return results;
  }
}
