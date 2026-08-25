import 'dotenv/config';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Only `marsella-test` for now: it is the one that is instrumented. The two
 * production servers get registered through the UI once that exists, which is
 * also how the registration flow gets tested on something real.
 *
 * The host is the Tailscale IP, not a MagicDNS name, for the same reason
 * Prometheus targets are: it keeps SSH on the tailnet, which is where the key
 * is restricted to work from.
 */
const SERVERS = [
  { name: 'marsella-test', host: '100.100.0.4', tailnetIp: '100.100.0.4' },
];

async function main() {
  const url = process.env.DATABASE_URL ?? 'file:./atalaya.db';
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

  for (const server of SERVERS) {
    await prisma.server.upsert({
      where: { name: server.name },
      create: server,
      // Only the addresses are refreshed: everything else may have been edited
      // deliberately, and a seed should not undo that.
      update: { host: server.host, tailnetIp: server.tailnetIp },
    });
    console.log(`  ${server.name} → ${server.host}`);
  }

  await prisma.$disconnect();
}

void main();
