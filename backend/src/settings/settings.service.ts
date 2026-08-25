import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface SettingsView {
  healthchecksUrl: string | null;
}

const SINGLETON_ID = 1;

/**
 * The handful of values with no other home. A singleton row rather than a
 * key-value table: there is exactly one of these today (the Watchdog ping
 * URL), and a generic table would be solving a problem that does not exist
 * yet.
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<SettingsView> {
    const row = await this.prisma.settings.findUnique({ where: { id: SINGLETON_ID } });
    return { healthchecksUrl: row?.healthchecksUrl ?? null };
  }

  async update(healthchecksUrl: string | null): Promise<SettingsView> {
    const row = await this.prisma.settings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, healthchecksUrl },
      update: { healthchecksUrl },
    });
    return { healthchecksUrl: row.healthchecksUrl };
  }
}
