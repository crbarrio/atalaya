import { Dialog } from '@angular/cdk/dialog';
import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { NewInstance } from '../new-instance/new-instance';

import { MetricsService } from '../../core/services/metrics.service';
import { RegistrationService } from '../../core/services/registration.service';
import { ServersService } from '../../core/services/servers.service';
import { formatLoad, formatUptime } from '../../shared/format-metrics';
import { healthTone } from '../../shared/health-tone';
import { usagePercent } from '../../shared/usage-percent';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { CpuCoresPipe } from '../../shared/pipes/cpu-cores.pipe';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { commandRunner } from '../../shared/command-runner';
import { valueOr } from '../../shared/resource-value';
import { CommandConsole } from '../../shared/ui/command-console/command-console';
import { HistoryChart } from '../../shared/ui/history-chart/history-chart';
import { HostContainers } from '../../shared/ui/host-containers/host-containers';
import { MetaChip } from '../../shared/ui/meta-chip/meta-chip';
import { StateBadge } from '../../shared/ui/state-badge/state-badge';
import { UsageBar } from '../../shared/ui/usage-bar/usage-bar';

@Component({
  selector: 'app-server-detail',
  imports: [
    RouterLink,
    DecimalPipe,
    RelativeTimePipe,
    BytesPipe,
    CpuCoresPipe,
    StateBadge,
    MetaChip,
    UsageBar,
    HistoryChart,
    HostContainers,
    CommandConsole,
  ],
  templateUrl: './server-detail.html',
})
export class ServerDetailPage {
  // Bound from the :name route segment by withComponentInputBinding().
  readonly name = input.required<string>();

  private readonly serversService = inject(ServersService);
  private readonly metricsService = inject(MetricsService);
  private readonly registrationService = inject(RegistrationService);
  private readonly router = inject(Router);
  private readonly dialog = inject(Dialog);

  // Re-fetches on its own whenever `name()` changes (navigating between
  // servers without leaving this route re-triggers the request).
  protected readonly detail = this.serversService.serverDetail(this.name);
  protected readonly metrics = this.metricsService.serverMetrics(this.name);

  readonly server = computed(() => this.detail.value());
  protected readonly avatarTone = computed(() => healthTone(this.server()?.health ?? ''));

  /** No `stack` here: no instances, no backups, no deregistering — containers instead. */
  protected readonly isHost = computed(() => this.server()?.kind === 'host');
  protected readonly hostContainers = this.metricsService.hostContainers(this.name);

  protected readonly historyValue = computed(() => valueOr(this.history, undefined));
  protected readonly containersValue = computed(() => valueOr(this.hostContainers, []));

  /**
   * Everything below reads metrics through this, never `metrics.value()`.
   *
   * Reading `.value()` on an errored resource throws, and a throw during change
   * detection takes the whole view down — so with Prometheus unreachable this
   * page went blank rather than showing the server without its numbers. Its
   * neighbours were guarded when that was found on the instance page; this one
   * was missed, and only showed up on being sent here by a retire.
   */
  protected readonly metricsSafe = computed(() => valueOr(this.metrics, undefined));

  protected readonly historyHours = signal(24);
  protected readonly historyRanges = [
    { label: '24h', hours: 24 },
    { label: '7d', hours: 24 * 7 },
    { label: '30d', hours: 24 * 30 },
  ];
  protected readonly history = this.metricsService.history(this.name, this.historyHours);

  protected readonly cpuPercent = computed(() => this.metricsSafe()?.server.cpu.percent ?? null);
  protected readonly memoryPercent = computed(() => usagePercent(this.metricsSafe()?.server.memory));

  protected readonly diskPreferences = this.metricsService.diskPreferences(this.name);

  /**
   * One bar per mounted filesystem, already fullest-first from the backend,
   * each carrying its alert switches. A disk with no stored preference has
   * both on — that is what makes a newly added disk alert without setup.
   */
  protected readonly disks = computed(() => {
    const preferences = new Map(valueOr(this.diskPreferences, []).map((p) => [p.mountpoint, p]));
    return (this.metricsSafe()?.server.disks ?? []).map((disk) => ({
      ...disk,
      percent: usagePercent(disk),
      trendAlerts: preferences.get(disk.mountpoint)?.trendAlerts ?? true,
      capacityAlerts: preferences.get(disk.mountpoint)?.capacityAlerts ?? true,
    }));
  });

  protected async toggleDiskAlert(
    mountpoint: string,
    field: 'trendAlerts' | 'capacityAlerts',
    enabled: boolean,
  ): Promise<void> {
    await this.metricsService.updateDiskPreference(this.name(), mountpoint, { [field]: enabled });
    this.diskPreferences.reload();
  }

  /** Instance memory/CPU, keyed by name, so the table can look them up per row without re-scanning. */
  protected readonly instanceUsage = computed(
    () => new Map(this.metricsSafe()?.instances.map((i) => [i.name, i]) ?? []),
  );

  protected readonly memoryDaysRemaining = computed(() => this.metricsSafe()?.server.memory.daysRemaining ?? null);

  /** Duration of the mode SSH last recorded a status for — the two sources describe the same run. */
  protected readonly backupDuration = computed(() => {
    const mode = this.server()?.backup.mode;
    const seconds = this.metricsSafe()?.backup.find((d) => d.mode === mode)?.seconds;
    return seconds !== undefined ? formatDuration(seconds) : null;
  });

  protected readonly alerts = computed(() => this.metricsSafe()?.alerts ?? []);

  protected readonly uptime = computed(() => {
    const seconds = this.metricsSafe()?.server.uptime.seconds;
    return seconds !== undefined && seconds !== null ? formatUptime(seconds) : null;
  });

  protected readonly load = computed(() => formatLoad(this.metricsSafe()?.server.load));

  /** Collectors Prometheus cannot currently scrape — a pipeline problem, distinct from SSH reachability. */
  protected readonly downCollectors = computed(() => {
    const scrape = this.metricsSafe()?.server.scrape;
    if (!scrape) return [];
    const down: string[] = [];
    if (scrape.node === false) down.push('node_exporter');
    if (scrape.cadvisor === false) down.push('cAdvisor');
    return down;
  });

  /** traefik/mysql/postgres — one per server, shown apart from the instance table, in mount order. */
  protected readonly engine = computed(() => {
    const byService = new Map(this.metricsSafe()?.engine.map((e) => [e.service, e]) ?? []);
    return ENGINE_ORDER.map((service) => byService.get(service)).filter((e) => e !== undefined);
  });

  /** 404 vs. a request that failed outright are different messages. */
  protected readonly notFound = computed(() => {
    const error = this.detail.error() as { status?: number } | undefined;
    return error?.status === 404;
  });

  /** Always Overview, not browser history — a bookmarked/refreshed server URL has no in-app history to go back to. */
  protected goBack(): void {
    this.router.navigateByUrl('/overview');
  }

  /**
   * The dialog is given the server it was opened from, so there is no second
   * place to choose one. Reloading on close rather than on success: the backend
   * refreshes the inventory itself, and a cancelled dialog costs one request.
   */
  protected openNewInstance(): void {
    const dialogRef = this.dialog.open(NewInstance, { data: { server: this.name() } });
    dialogRef.componentInstance?.closed.subscribe(() => dialogRef.close());
    dialogRef.closed.subscribe(() => this.detail.reload());
  }

  protected engineIcon(service: string): string {
    return ENGINE_ICONS[service] ?? 'settings_ethernet';
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  protected readonly runner = commandRunner();
  /** `full` or `incremental` awaiting confirmation, or null. */
  protected readonly confirmingBackup = signal<'full' | 'incremental' | null>(null);

  protected askBackup(mode: 'full' | 'incremental'): void {
    this.confirmingBackup.set(mode);
  }

  protected runBackup(mode: 'full' | 'incremental'): void {
    this.confirmingBackup.set(null);
    this.runner.start(this.name(), 'backup', { instance: mode });
  }

  protected runStatus(): void {
    this.confirmingBackup.set(null);
    this.runner.start(this.name(), 'status', {});
  }

  protected readonly confirmingDeregister = signal(false);
  protected readonly deregistering = signal(false);
  protected readonly deregisterError = signal<string | null>(null);
  /** Forces the cleanup script to be seen at least once before the machine can be dropped. */
  protected readonly cleanupDownloaded = signal(false);

  protected startDeregisterConfirm(): void {
    this.cleanupDownloaded.set(false);
    this.confirmingDeregister.set(true);
  }

  /** Same artifact `setup-server.sh` personalises for onboarding — it also carries an `--uninstall` mode. */
  protected cleanupScriptUrl(): string {
    return this.registrationService.setupScriptUrl(this.name());
  }

  protected async deregister(): Promise<void> {
    this.deregistering.set(true);
    this.deregisterError.set(null);
    try {
      await this.registrationService.deregister(this.name());
      this.router.navigateByUrl('/servers');
    } catch {
      this.deregisterError.set('Could not deregister — try again.');
      this.deregistering.set(false);
    }
  }
}

function formatDuration(seconds: number): string {
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}m${Math.round(seconds % 60)}s`
    : `${Math.round(seconds)}s`;
}

const ENGINE_ORDER = ['traefik', 'mysql', 'phpmyadmin', 'postgres', 'adminer'];

const ENGINE_ICONS: Record<string, string> = {
  traefik: 'router',
  mysql: 'database',
  postgres: 'database',
  phpmyadmin: 'admin_panel_settings',
  adminer: 'admin_panel_settings',
};
