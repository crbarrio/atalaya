import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { StackInventory } from './interfaces/stack-inventory.interface';
import { parseStackDate } from './parsers/stack-date.parser';

/** Writes an inventory into the cache. Knows nothing about SSH. */
@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Everything in one transaction, so the cache is never half updated. */
  async save(serverId: string, inventory: StackInventory): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.server.update({
        where: { id: serverId },
        data: {
          lastSeenAt: new Date(),
          lastError: null,
          manifestAt: inventory.manifest_at ? new Date(inventory.manifest_at) : null,
          containersObservable: inventory.containers_observable,
          lastBackupStatus: inventory.backup?.status ?? null,
          lastBackupAt: inventory.backup?.at ?? null,
          lastBackupMode: inventory.backup?.mode ?? null,
          lastBackupDetail: inventory.backup?.detail ?? null,
        },
      });

      const fetchedAt = new Date();
      for (const item of inventory.instances) {
        const data = {
          app: item.app,
          client: item.client,
          enabled: item.enabled,
          version: item.version,
          deployedAt: parseStackDate(item.deployed_at),
          previousVersion: item.previous_version,
          previousAt: parseStackDate(item.previous_at),
          state: item.state,
          containers: item.containers ? JSON.stringify(item.containers) : null,
          volumes: item.volumes
            ? JSON.stringify(item.volumes.map((v) => ({ name: v.name, sizeBytes: v.size_bytes })))
            : null,
          databaseEngine: item.database?.engine ?? null,
          databaseName: item.database?.name ?? null,
          domains: JSON.stringify(item.domains ?? []),
          fetchedAt,
        };

        await tx.instance.upsert({
          where: { serverId_name: { serverId, name: item.name } },
          create: { serverId, name: item.name, ...data },
          update: data,
        });
      }

      // Retired instances stop being reported. Dropping only what this pass did
      // not see keeps the cache honest without a delete-and-insert, which would
      // empty the panel for a moment on every refresh.
      await tx.instance.deleteMany({
        where: { serverId, name: { notIn: inventory.instances.map((i) => i.name) } },
      });
    });
  }

  /** Records why a read failed, leaving the cached instances untouched. */
  async saveFailure(serverId: string, message: string): Promise<void> {
    await this.prisma.server.update({
      where: { id: serverId },
      data: { lastError: message },
    });
  }
}
