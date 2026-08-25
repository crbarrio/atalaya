import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Server } from '../../../core/models/server.model';
import { MetricsService } from '../../../core/services/metrics.service';
import { formatLoad, formatUptime } from '../../../shared/format-metrics';
import { healthBorderClass, healthTone } from '../../../shared/health-tone';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { StateBadge } from '../../../shared/ui/state-badge/state-badge';
import { usagePercent } from '../../../shared/usage-percent';

@Component({
  selector: 'app-server-card',
  imports: [RouterLink, DecimalPipe, RelativeTimePipe, StateBadge],
  templateUrl: './server-card.html',
})
export class ServerCard {
  readonly server = input.required<Server>();

  private readonly metricsService = inject(MetricsService);
  protected readonly metrics = this.metricsService.serverMetrics(computed(() => this.server().name));

  /** A host server has no instances and no backups — only the metrics half applies. */
  protected readonly isHost = computed(() => this.server().kind === 'host');

  protected readonly borderClass = computed(() => healthBorderClass(this.server().health));
  protected readonly avatarTone = computed(() => healthTone(this.server().health));

  protected readonly cpuPercent = computed(() => this.metrics.value()?.server.cpu.percent ?? null);
  protected readonly memoryPercent = computed(() => usagePercent(this.metrics.value()?.server.memory));
  protected readonly diskPercent = computed(() => usagePercent(this.metrics.value()?.server.disk));

  protected readonly uptime = computed(() => {
    const seconds = this.metrics.value()?.server.uptime.seconds;
    return seconds !== undefined && seconds !== null ? formatUptime(seconds) : null;
  });

  protected readonly load = computed(() => formatLoad(this.metrics.value()?.server.load));
}
