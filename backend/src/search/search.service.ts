import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { SearchResults } from './interfaces/search-result.interface';

const MAX_RESULTS = 10;

/**
 * Servers by name, instances by name/app/client — one query each, both
 * substring, case-insensitive for free (SQLite's `LIKE` already is, for
 * ASCII, so `contains` needs no extra option here the way it would on
 * Postgres).
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: string): Promise<SearchResults> {
    const q = query.trim();
    if (!q) return { servers: [], instances: [] };

    const [servers, instances] = await Promise.all([
      this.prisma.server.findMany({
        where: { enabled: true, name: { contains: q } },
        select: { name: true },
        orderBy: { name: 'asc' },
        take: MAX_RESULTS,
      }),
      this.prisma.instance.findMany({
        where: {
          enabled: true,
          server: { enabled: true },
          OR: [{ name: { contains: q } }, { app: { contains: q } }, { client: { contains: q } }],
        },
        select: { name: true, app: true, client: true, server: { select: { name: true } } },
        orderBy: { name: 'asc' },
        take: MAX_RESULTS,
      }),
    ]);

    return {
      servers: servers.map((s) => ({ name: s.name })),
      instances: instances.map((i) => ({ server: i.server.name, name: i.name, app: i.app, client: i.client })),
    };
  }
}
