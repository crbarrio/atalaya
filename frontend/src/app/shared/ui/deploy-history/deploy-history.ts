import { Component, computed, input } from '@angular/core';

import { DeployHistoryEntry } from '../../../core/models/history.model';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';

@Component({
  selector: 'app-deploy-history',
  imports: [RelativeTimePipe],
  template: `
    <div class="rounded-xs border border-outline-variant bg-surface-container-low p-4">
      <span class="font-jetbrains text-on-surface-variant block text-xs uppercase">Deploy history</span>

      @if (loading()) {
        <p class="text-on-surface-variant mt-2 text-xs">Loading…</p>
      } @else if (mostRecentFirst().length === 0) {
        <p class="text-on-surface-variant mt-2 text-xs">
          No deploys recorded in this window yet — this metric only started being written recently.
        </p>
      } @else {
        <ul class="mt-2 flex flex-col gap-2">
          @for (entry of mostRecentFirst(); track entry.from) {
            <li class="flex items-center justify-between gap-4 text-xs">
              <span class="font-jetbrains text-on-surface truncate">{{ entry.version }}</span>
              <span class="text-on-surface-variant shrink-0">
                @if (entry.to === null) {
                  <span class="text-secondary">current</span> · since {{ entry.from | relativeTime }}
                } @else {
                  {{ entry.from | relativeTime }} → {{ entry.to | relativeTime }}
                }
              </span>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class DeployHistory {
  readonly entries = input.required<DeployHistoryEntry[]>();
  readonly loading = input(false);

  protected readonly mostRecentFirst = computed(() => [...this.entries()].reverse());
}
