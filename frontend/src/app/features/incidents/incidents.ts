import { Component, computed, inject, signal } from '@angular/core';

import { IncidentsService } from '../../core/services/incidents.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { MetaChip } from '../../shared/ui/meta-chip/meta-chip';

const SILENCE_OPTIONS = [
  { label: '1h', hours: 1 },
  { label: '4h', hours: 4 },
  { label: '24h', hours: 24 },
];

@Component({
  selector: 'app-incidents',
  imports: [RelativeTimePipe, MetaChip],
  templateUrl: './incidents.html',
})
export class Incidents {
  private readonly incidentsService = inject(IncidentsService);

  protected readonly incidents = this.incidentsService.list();
  protected readonly silenceOptions = SILENCE_OPTIONS;

  protected readonly firing = computed(
    () => this.incidents.value().filter((i) => i.status === 'firing').length,
  );
  protected readonly resolved = computed(
    () => this.incidents.value().filter((i) => i.status === 'resolved').length,
  );

  /** id of the incident whose silence-duration menu is open, if any. */
  protected readonly openMenuFor = signal<string | null>(null);
  /** id of the incident a silence request is in flight for. */
  protected readonly silencing = signal<string | null>(null);

  protected toggleMenu(id: string): void {
    this.openMenuFor.update((current) => (current === id ? null : id));
  }

  protected async silence(id: string, hours: number): Promise<void> {
    this.openMenuFor.set(null);
    this.silencing.set(id);
    try {
      await this.incidentsService.silence(id, hours);
    } finally {
      this.silencing.set(null);
    }
  }
}
