import { DecimalPipe } from '@angular/common';
import { Component, input } from '@angular/core';

import { HostContainer } from '../../../core/models/server-metrics.model';
import { BytesPipe } from '../../pipes/bytes.pipe';

/** What a host server shows instead of instances: every container, by name. */
@Component({
  selector: 'app-host-containers',
  imports: [BytesPipe, DecimalPipe],
  template: `
    <div class="flex flex-col gap-3 rounded-xs border border-outline-variant bg-surface-container-low p-4">
      <span class="font-jetbrains text-on-surface-variant text-xs uppercase tracking-wide">Containers</span>

      @if (loading()) {
        <p class="text-on-surface-variant text-xs">Loading…</p>
      } @else if (containers().length === 0) {
        <p class="text-on-surface-variant text-xs">cAdvisor is not reporting any container here.</p>
      } @else {
        <ul class="flex flex-col gap-1">
          @for (container of containers(); track container.name) {
            <li class="flex items-center justify-between gap-4 font-jetbrains text-xs">
              <span class="truncate text-on-surface">{{ container.name }}</span>
              <span class="shrink-0 text-on-surface-variant">
                {{ container.cpuCores | number: '1.0-2' }} cores · {{ container.memoryBytes | bytes }}
              </span>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class HostContainers {
  readonly containers = input.required<HostContainer[]>();
  readonly loading = input(false);
}
