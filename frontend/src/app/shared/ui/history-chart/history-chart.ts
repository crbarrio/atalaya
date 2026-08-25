import { Component, computed, input } from '@angular/core';
import { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import { ServerHistory } from '../../../core/models/history.model';
import { formatHistoryLabel, peakOf } from '../../format-history';

// Matching the fixed palette in styles.css — this app has one theme, so no
// runtime lookup, just the same hex values Tailwind's @theme block defines.
const CPU_COLOR = '#adc6ff'; // --color-primary
const MEMORY_COLOR = '#4edea3'; // --color-secondary
const DISK_COLOR = '#ffb95f'; // --color-tertiary
const ON_SURFACE_VARIANT = '#c1c6d7';
const OUTLINE_VARIANT = '#414755';

@Component({
  selector: 'app-history-chart',
  imports: [BaseChartDirective],
  template: `
    <div class="flex flex-col gap-3 rounded-xs border border-outline-variant bg-surface-container-low p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-on-surface-variant text-xs uppercase tracking-wide">CPU / RAM / Disk</span>
        <div class="flex flex-wrap gap-3 font-jetbrains text-[11px]">
          <span class="text-primary">peak CPU {{ peaks().cpu !== null ? peaks().cpu!.toFixed(0) + '%' : '—' }}</span>
          <span class="text-secondary">peak RAM {{ peaks().memory !== null ? peaks().memory!.toFixed(0) + '%' : '—' }}</span>
          <span class="text-tertiary">peak Disk {{ peaks().disk !== null ? peaks().disk!.toFixed(0) + '%' : '—' }}</span>
        </div>
      </div>

      @if (loading()) {
        <p class="text-on-surface-variant text-xs">Loading…</p>
      } @else if (empty()) {
        <p class="text-on-surface-variant text-xs">No data for this window yet.</p>
      } @else {
        <div class="h-56">
          <canvas baseChart [data]="chartData()" [options]="chartOptions" type="line"></canvas>
        </div>
      }
    </div>
  `,
})
export class HistoryChart {
  readonly history = input<ServerHistory | undefined>();
  readonly hours = input.required<number>();
  readonly loading = input(false);

  protected readonly empty = computed(() => {
    const h = this.history();
    return !h || (h.cpu.length === 0 && h.memory.length === 0 && h.disk.length === 0);
  });

  protected readonly peaks = computed(() => {
    const h = this.history();
    return { cpu: peakOf(h?.cpu), memory: peakOf(h?.memory), disk: peakOf(h?.disk) };
  });

  protected readonly chartData = computed<ChartConfiguration<'line'>['data']>(() => {
    const h = this.history();
    const hoursSpan = this.hours();
    const labels = (h?.cpu ?? []).map((p) => formatHistoryLabel(p.t, hoursSpan));

    return {
      labels,
      datasets: [
        dataset('CPU', h?.cpu.map((p) => p.v) ?? [], CPU_COLOR),
        dataset('RAM', h?.memory.map((p) => p.v) ?? [], MEMORY_COLOR),
        dataset('Disk', h?.disk.map((p) => p.v) ?? [], DISK_COLOR),
      ],
    };
  });

  protected readonly chartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    elements: { point: { radius: 0 }, line: { tension: 0.2, borderWidth: 1.5 } },
    scales: {
      y: {
        min: 0,
        max: 100,
        ticks: { color: ON_SURFACE_VARIANT, callback: (v) => `${v}%` },
        grid: { color: OUTLINE_VARIANT },
      },
      x: {
        ticks: { color: ON_SURFACE_VARIANT, maxTicksLimit: 8, maxRotation: 0 },
        grid: { display: false },
      },
    },
    plugins: {
      // A filled box would show as an empty outline: these are lines with no
      // fill (`backgroundColor: 'transparent'`), so the swatch has to be one too.
      legend: { labels: { color: ON_SURFACE_VARIANT, usePointStyle: true, pointStyle: 'line' } },
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${(ctx.raw as number).toFixed(1)}%` } },
    },
  };
}

function dataset(label: string, data: number[], color: string): ChartConfiguration<'line'>['data']['datasets'][number] {
  return { label, data, borderColor: color, backgroundColor: 'transparent', pointRadius: 0 };
}
