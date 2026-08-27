import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { MetricsService } from '../../core/services/metrics.service';
import { RegistrationService } from '../../core/services/registration.service';
import { ServersService } from '../../core/services/servers.service';
import { formatLoad, formatUptime } from '../../shared/format-metrics';
import { healthTone } from '../../shared/health-tone';
import { usagePercent } from '../../shared/usage-percent';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { CpuCoresPipe } from '../../shared/pipes/cpu-cores.pipe';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
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

  // Re-fetches on its own whenever `name()` changes (navigating between
  // servers without leaving this route re-triggers the request).
  protected readonly detail = this.serversService.serverDetail(this.name);
  protected readonly metrics = this.metricsService.serverMetrics(this.name);

  readonly server = computed(() => this.detail.value());
  protected readonly avatarTone = computed(() => healthTone(this.server()?.health ?? ''));

  /** No `stack` here: no instances, no backups, no deregistering — containers instead. */
  protected readonly isHost = computed(() => this.server()?.kind === 'host');
  protected readonly hostContainers = this.metricsService.hostContainers(this.name);

  protected readonly historyHours = signal(24);
  protected readonly historyRanges = [
    { label: '24h', hours: 24 },
    { label: '7d', hours: 24 * 7 },
    { label: '30d', hours: 24 * 30 },
  ];
  protected readonly history = this.metricsService.history(this.name, this.historyHours);

  protected readonly cpuPercent = computed(() => this.metrics.value()?.server.cpu.percent ?? null);
  protected readonly memoryPercent = computed(() => usagePercent(this.metrics.value()?.server.memory));

  protected readonly diskPreferences = this.metricsService.diskPreferences(this.name);

  /**
   * One bar per mounted filesystem, already fullest-first from the backend,
   * each carrying its alert switches. A disk with no stored preference has
   * both on — that is what makes a newly added disk alert without setup.
   */
  protected readonly disks = computed(() => {
    const preferences = new Map(this.diskPreferences.value().map((p) => [p.mountpoint, p]));
    return (this.metrics.value()?.server.disks ?? []).map((disk) => ({
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
    () => new Map(this.metrics.value()?.instances.map((i) => [i.name, i]) ?? []),
  );

  protected readonly memoryDaysRemaining = computed(() => this.metrics.value()?.server.memory.daysRemaining ?? null);

  /** Duration of the mode SSH last recorded a status for — the two sources describe the same run. */
  protected readonly backupDuration = computed(() => {
    const mode = this.server()?.backup.mode;
    const seconds = this.metrics.value()?.backup.find((d) => d.mode === mode)?.seconds;
    return seconds !== undefined ? formatDuration(seconds) : null;
  });

  protected readonly alerts = computed(() => this.metrics.value()?.alerts ?? []);

  protected readonly uptime = computed(() => {
    const seconds = this.metrics.value()?.server.uptime.seconds;
    return seconds !== undefined && seconds !== null ? formatUptime(seconds) : null;
  });

  protected readonly load = computed(() => formatLoad(this.metrics.value()?.server.load));

  /** Collectors Prometheus cannot currently scrape — a pipeline problem, distinct from SSH reachability. */
  protected readonly downCollectors = computed(() => {
    const scrape = this.metrics.value()?.server.scrape;
    if (!scrape) return [];
    const down: string[] = [];
    if (scrape.node === false) down.push('node_exporter');
    if (scrape.cadvisor === false) down.push('cAdvisor');
    return down;
  });

  /** traefik/mysql/postgres — one per server, shown apart from the instance table, in mount order. */
  protected readonly engine = computed(() => {
    const byService = new Map(this.metrics.value()?.engine.map((e) => [e.service, e]) ?? []);
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

  protected engineIcon(service: string): string {
    return ENGINE_ICONS[service] ?? 'settings_ethernet';
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
