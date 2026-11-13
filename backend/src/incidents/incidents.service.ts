import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AlertmanagerService } from '../shared/alertmanager/alertmanager.service';
import { IncidentView } from './interfaces/incident-view.interface';
import { SilenceIncidentResult } from './interfaces/silence-incident.interface';
import { toIncidentView } from './incidents.mapper';
import { parseLabels } from './parse-labels';

const MS_PER_HOUR = 3600 * 1000;

/**
 * Alertmanager keeps no alerts across a restart; Prometheus resends them on its
 * next evaluation of each rule group. Until a few of those have passed, an
 * alert missing from Alertmanager may simply not have arrived yet.
 */
const RECONCILE_MIN_UPTIME_MS = 10 * 60 * 1000;

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alertmanager: AlertmanagerService,
  ) {}

  async findAll(): Promise<IncidentView[]> {
    const rows = await this.prisma.incident.findMany({
      include: { server: { select: { name: true } } },
      orderBy: { receivedAt: 'desc' },
    });
    return rows.map(toIncidentView);
  }

  /**
   * "I know, stop routing this for a while" — pushed straight to Alertmanager's
   * silence API, not stored here. atalaya's own `status` column is left alone:
   * it answers whether the *condition* is still true, which a silence does not
   * change. Matchers come from the alert's own stored label set, so the
   * silence matches exactly what fired — no looser than that.
   */
  async silence(id: string, hours: number, actor: string): Promise<SilenceIncidentResult> {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException(`Unknown incident '${id}'`);

    const labels = parseLabels(incident.labels);
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + hours * MS_PER_HOUR);

    const silenceId = await this.alertmanager.createSilence({
      matchers: Object.entries(labels).map(([name, value]) => ({ name, value, isRegex: false })),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      createdBy: actor,
      comment: `Silenced from atalaya: ${incident.alertName}`,
    });

    return { silenceId, endsAt };
  }

  /**
   * Closes every firing incident Alertmanager no longer holds as active, and
   * returns how many. The webhook alone cannot be trusted to close them:
   * Alertmanager never sends the `resolved` for a group whose `firing` it
   * counts as undelivered, even when atalaya did store it. That happened on
   * 2026-10-20 — an internet outage made the webhook outlast Alertmanager's
   * deadline while it waited on the notifier, and 27 incidents stayed firing
   * for weeks after their conditions had cleared. A `resolved` sent while
   * atalaya is restarting is lost the same way.
   *
   * Only when the alerting chain is demonstrably whole: the Watchdog, always
   * firing, proves Prometheus is feeding Alertmanager — without it every alert
   * would look gone — and a freshly restarted Alertmanager has not been resent
   * everything yet. Not notified: what is corrected here is bookkeeping, and
   * the condition may have cleared long ago.
   */
  async reconcile(): Promise<number> {
    const [alerts, startedAt] = await Promise.all([
      this.alertmanager.getAlerts(),
      this.alertmanager.getStartedAt(),
    ]);
    if (Date.now() - startedAt.getTime() < RECONCILE_MIN_UPTIME_MS) return 0;
    if (!alerts.some((alert) => alert.labels.alertname === 'Watchdog')) {
      throw new Error('no Watchdog in Alertmanager: Prometheus may not be feeding it, nothing closed');
    }

    const { count } = await this.prisma.incident.updateMany({
      where: { status: 'firing', fingerprint: { notIn: alerts.map((alert) => alert.fingerprint) } },
      data: { status: 'resolved', endsAt: new Date() },
    });
    return count;
  }
}
