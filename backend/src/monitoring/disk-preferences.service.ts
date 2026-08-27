import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { DiskAlertPreferenceView } from './interfaces/server-metrics.interface';

/**
 * Which disk alerts are on, per server and mountpoint. A row exists only for a
 * disk something has been switched off on; everything else is on by default,
 * so a new disk starts alerting without anyone configuring it.
 */
@Injectable()
export class DiskPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(serverName: string): Promise<DiskAlertPreferenceView[]> {
    const rows = await this.prisma.diskAlertPreference.findMany({
      where: { server: { name: serverName } },
      orderBy: { mountpoint: 'asc' },
    });
    return rows.map((r) => ({
      mountpoint: r.mountpoint,
      trendAlerts: r.trendAlerts,
      capacityAlerts: r.capacityAlerts,
    }));
  }

  async update(
    serverName: string,
    mountpoint: string,
    changes: { trendAlerts?: boolean; capacityAlerts?: boolean },
  ): Promise<DiskAlertPreferenceView> {
    const server = await this.prisma.server.findUnique({ where: { name: serverName } });
    if (!server) throw new NotFoundException(`Unknown server '${serverName}'`);

    const row = await this.prisma.diskAlertPreference.upsert({
      where: { serverId_mountpoint: { serverId: server.id, mountpoint } },
      create: { serverId: server.id, mountpoint, ...changes },
      update: changes,
    });
    return {
      mountpoint: row.mountpoint,
      trendAlerts: row.trendAlerts,
      capacityAlerts: row.capacityAlerts,
    };
  }
}
