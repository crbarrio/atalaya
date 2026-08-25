import { Injectable, Logger } from '@nestjs/common';

import { NotifierService } from '../notifier/notifier.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AlertmanagerAlert, AlertmanagerWebhookPayload } from './interfaces/alertmanager-webhook.interface';

const PING_TIMEOUT_MS = 10_000;

/**
 * `Watchdog` is a heartbeat, not something to show in an inbox: it is pulled
 * out and pinged to healthchecks.io instead of becoming an Incident row. See
 * *Watching the watchman* in PLAN.md.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifier: NotifierService,
  ) {}

  async handleAlertmanagerWebhook(payload: AlertmanagerWebhookPayload): Promise<void> {
    for (const alert of payload.alerts) {
      if (alert.labels.alertname === 'Watchdog') {
        await this.pingWatchdog();
      } else {
        await this.upsertIncident(alert);
      }
    }
  }

  private async pingWatchdog(): Promise<void> {
    const { healthchecksUrl: url } = await this.settings.get();
    if (!url) {
      this.logger.warn('Watchdog alert received but no Healthchecks URL is set — see Settings');
      return;
    }
    try {
      await fetch(url, { signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Could not ping healthchecks.io: ${message}`);
    }
  }

  /**
   * Keyed on the fingerprint Alertmanager already computes: a repeat of the
   * same alert updates the row instead of duplicating it, and a `resolved`
   * webhook closes it out.
   *
   * Notified only on the two edges — first seen, and firing → resolved —
   * never on every repeat while still firing: Alertmanager resends a firing
   * alert on its own `repeat_interval`, and a channel is not a log.
   */
  private async upsertIncident(alert: AlertmanagerAlert): Promise<void> {
    const serverName = alert.labels.server;
    const server = serverName
      ? await this.prisma.server.findUnique({ where: { name: serverName } })
      : null;

    const fields = {
      alertName: alert.labels.alertname ?? 'unknown',
      severity: alert.labels.severity ?? 'warning',
      status: alert.status,
      summary: alert.annotations.summary ?? null,
      description: alert.annotations.description ?? null,
      labels: JSON.stringify(alert.labels),
      // Alertmanager sends a zero-value endsAt on a still-firing alert, not
      // an absent field — trust `status`, not the timestamp, for this.
      endsAt: alert.status === 'resolved' ? new Date(alert.endsAt) : null,
      serverId: server?.id ?? null,
    };

    const existing = await this.prisma.incident.findUnique({ where: { fingerprint: alert.fingerprint } });

    const incident = await this.prisma.incident.upsert({
      where: { fingerprint: alert.fingerprint },
      create: { fingerprint: alert.fingerprint, startsAt: new Date(alert.startsAt), ...fields },
      update: fields,
    });

    const isNew = !existing;
    const justResolved = existing?.status !== 'resolved' && alert.status === 'resolved';
    if (isNew || justResolved) {
      await this.notifier.notify({
        alertName: incident.alertName,
        severity: incident.severity,
        summary: incident.summary,
        description: incident.description,
        serverName: serverName ?? null,
        status: alert.status,
      });
    }
  }
}
