import { Injectable, Logger } from '@nestjs/common';

import { IncidentNotification } from '../notifier/interfaces/notification-adapter.interface';
import { NotifierService } from '../notifier/notifier.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AlertmanagerAlert, AlertmanagerWebhookPayload } from './interfaces/alertmanager-webhook.interface';

const PING_TIMEOUT_MS = 10_000;

/** Disk alerts that can be switched off per mountpoint, and the flag that does it. */
const MUTABLE_DISK_ALERTS: Record<string, 'trendAlerts' | 'capacityAlerts' | undefined> = {
  DiskWillFillIn4Days: 'trendAlerts',
  DiskAlmostFull: 'capacityAlerts',
};

/**
 * `Watchdog` is a heartbeat, not something to show in an inbox: it is pulled
 * out and pinged to healthchecks.io instead of becoming an Incident row. See
 * *Watching the watchman* in architecture.md.
 */
@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifier: NotifierService,
  ) {}

  /**
   * Stores what arrived and returns; whatever has to reach the outside world
   * (notifications, the Watchdog ping) runs after the response, not before.
   * Alertmanager counts a webhook that outlasts its deadline as undelivered,
   * and never sends the `resolved` for a group it thinks was never notified.
   * During the 2026-10-20 internet outage every send waited out its timeout,
   * the webhook took longer than that deadline, and the incidents atalaya had
   * already stored were never closed. `IncidentsService.reconcile()` closes
   * any left behind anyway; this keeps the outage from leaving them at all.
   */
  async handleAlertmanagerWebhook(payload: AlertmanagerWebhookPayload): Promise<void> {
    const outbound: Array<() => Promise<void>> = [];
    for (const alert of payload.alerts) {
      if (alert.labels.alertname === 'Watchdog') {
        outbound.push(() => this.pingWatchdog());
      } else if (await this.isMuted(alert)) {
        this.logger.debug(
          `Muted ${alert.labels.alertname} for ${alert.labels.server}:${alert.labels.mountpoint}`,
        );
      } else {
        const notification = await this.upsertIncident(alert);
        if (notification) outbound.push(() => this.notifier.notify(notification));
      }
    }
    void this.runOutbound(outbound);
  }

  /** In order, one at a time, and never rejecting: nobody is waiting on it. */
  private async runOutbound(tasks: Array<() => Promise<void>>): Promise<void> {
    for (const task of tasks) {
      try {
        await task();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Outbound delivery failed: ${message}`);
      }
    }
  }

  /**
   * Disk alerts the operator has switched off for one mountpoint. Suppressed
   * here rather than in the rule file because the premise is that this is
   * configurable from the UI, and Prometheus rules are files — the same reason
   * alert routing lives in the database. Prometheus still evaluates the rule;
   * it just does not become an incident or a notification.
   */
  private async isMuted(alert: AlertmanagerAlert): Promise<boolean> {
    const field = MUTABLE_DISK_ALERTS[alert.labels.alertname ?? ''];
    const { server, mountpoint } = alert.labels;
    if (!field || !server || !mountpoint) return false;

    const preference = await this.prisma.diskAlertPreference.findFirst({
      where: { mountpoint, server: { name: server } },
    });
    return preference ? !preference[field] : false;
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
   * Returns the notification to send, or null. Only on the two edges — first
   * seen, and firing → resolved — never on every repeat while still firing:
   * Alertmanager resends a firing alert on its own `repeat_interval`, and a
   * channel is not a log.
   */
  private async upsertIncident(alert: AlertmanagerAlert): Promise<IncidentNotification | null> {
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
    if (!isNew && !justResolved) return null;
    return {
      alertName: incident.alertName,
      severity: incident.severity,
      summary: incident.summary,
      description: incident.description,
      serverName: serverName ?? null,
      status: alert.status,
    };
  }
}
