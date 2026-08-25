import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

import { PrismaClient } from '../generated/prisma/client';

/**
 * Prisma 7 talks to the database through a driver adapter rather than its own
 * engine binary. For SQLite that is better-sqlite3, and the file it points at is
 * the whole database — there is no server to run alongside in development.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const url = process.env.DATABASE_URL ?? 'file:./atalaya.db';
    super({ adapter: new PrismaBetterSqlite3({ url }) });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
