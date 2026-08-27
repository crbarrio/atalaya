import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

export interface AuditRecord {
  actor: string;
  action: string;
  /** What it was done to: `server/instance`, or just the server. */
  target?: string;
  detail?: Record<string, unknown>;
  succeeded: boolean;
}

/**
 * Writes the record of every action that had an effect. PLAN.md's "every
 * action with an effect is recorded" — the table has existed since the first
 * migration and this is its first writer.
 *
 * Recorded on completion, so an action interrupted by a backend restart leaves
 * no row. That is a known gap rather than an oversight: the alternative is a
 * pending row that may never be resolved, which reads as a hung action nobody
 * can account for.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Never throws. An action that worked must not be reported as failed because
   * writing its audit row failed — but a silent gap in the audit trail is
   * worse than noise, so it is logged loudly.
   */
  async record(entry: AuditRecord): Promise<void> {
    try {
      await this.prisma.auditEntry.create({
        data: {
          actor: entry.actor,
          action: entry.action,
          target: entry.target ?? null,
          detail: entry.detail ? JSON.stringify(entry.detail) : null,
          succeeded: entry.succeeded,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `AUDIT WRITE FAILED — ${entry.actor} ${entry.action} ${entry.target ?? ''}: ${message}`,
      );
    }
  }
}
