import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AttentionItem, OverviewView, RecentAction } from './interfaces/overview.interface';

/** Enough to see the shape of the day without becoming a second incidents page. */
const MAX_ATTENTION = 8;
const MAX_RECENT = 8;

/**
 * Answers "what should I look at now", which is a different question from
 * "how is each machine", and the only reason this screen exists apart from
 * the server grid.
 *
 * It computes nothing itself. Prometheus's rules already decide what counts
 * as a problem — with thresholds tuned and per-disk mutes applied — and those
 * reach the `Incident` table through the webhook. Re-deriving any of that here
 * would mean two definitions of "wrong" that could disagree.
 */
@Injectable()
export class OverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<OverviewView> {
    const [servers, instanceCount, incidents, audit] = await Promise.all([
      this.prisma.server.findMany({
        where: { enabled: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.instance.count({ where: { server: { enabled: true } } }),
      this.prisma.incident.findMany({
        where: { status: 'firing' },
        orderBy: [{ severity: 'asc' }, { startsAt: 'desc' }],
        take: MAX_ATTENTION,
        include: { server: { select: { name: true } } },
      }),
      this.prisma.auditEntry.findMany({
        orderBy: { createdAt: 'desc' },
        take: MAX_RECENT,
      }),
    ]);

    const attention: AttentionItem[] = [
      ...incidents.map((incident) => ({
        kind: 'incident',
        severity: incident.severity === 'critical' ? ('critical' as const) : ('warning' as const),
        summary: incident.summary ?? incident.alertName,
        server: incident.server?.name ?? null,
        at: incident.startsAt.toISOString(),
      })),

      // Not an alert: Prometheus can be scraping a machine perfectly while the
      // SSH read that fills the inventory has been failing for hours.
      ...servers
        .filter((server) => server.kind === 'stack' && server.lastError)
        .map((server) => ({
          kind: 'unreachable',
          severity: 'critical' as const,
          summary: `atalaya cannot read ${server.name}: ${server.lastError}`,
          server: server.name,
          at: server.lastSeenAt?.toISOString() ?? null,
        })),

      // `BackupFailed` covers a run that failed; this covers one that never
      // ran at all, which emits no metric to alert on.
      ...servers
        .filter((server) => server.kind === 'stack' && !server.lastBackupStatus)
        .map((server) => ({
          kind: 'backup',
          severity: 'warning' as const,
          summary: `${server.name} has never reported a backup`,
          server: server.name,
          at: null,
        })),
    ];

    // Critical first, then newest. `sort` is stable, so the grouping above
    // survives within each severity.
    attention.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
      return (b.at ?? '').localeCompare(a.at ?? '');
    });

    const recent: RecentAction[] = audit.map((entry) => ({
      actor: entry.actor,
      action: entry.action,
      target: entry.target,
      succeeded: entry.succeeded,
      at: entry.createdAt.toISOString(),
    }));

    return {
      counts: {
        servers: servers.length,
        instances: instanceCount,
        attention: attention.length,
      },
      attention: attention.slice(0, MAX_ATTENTION),
      recent,
    };
  }
}
