import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { OverviewService } from '../../core/services/overview.service';
import { ServersService } from '../../core/services/servers.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { valueOr } from '../../shared/resource-value';
import { MetaChip } from '../../shared/ui/meta-chip/meta-chip';

/**
 * Answers "what should I look at now". The server grid at `/servers` answers
 * "how is each machine" — a different question, and the reason these are two
 * screens rather than the same one shown twice, which is what they were.
 */
@Component({
  selector: 'app-overview',
  imports: [RouterLink, MetaChip, RelativeTimePipe],
  templateUrl: './overview.html',
})
export class Overview {
  private readonly overviewService = inject(OverviewService);
  private readonly serversService = inject(ServersService);

  protected readonly resource = this.overviewService.overview();
  protected readonly data = computed(() => valueOr(this.resource, undefined));

  protected readonly attention = computed(() => this.data()?.attention ?? []);
  protected readonly recent = computed(() => this.data()?.recent ?? []);
  protected readonly counts = computed(
    () => this.data()?.counts ?? { servers: 0, instances: 0, attention: 0 },
  );

  /** Only to tell "still loading" from "genuinely nothing wrong". */
  protected readonly servers = this.serversService.list();
  protected readonly isLoading = this.resource.isLoading;
  protected readonly error = this.resource.error;

  protected icon(kind: string): string {
    return { incident: 'warning', unreachable: 'link_off', backup: 'backup' }[kind] ?? 'info';
  }
}
