import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { MetricsService } from '../../core/services/metrics.service';
import { ServersService } from '../../core/services/servers.service';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { DeployHistory } from '../../shared/ui/deploy-history/deploy-history';
import { MetaChip } from '../../shared/ui/meta-chip/meta-chip';
import { StateBadge } from '../../shared/ui/state-badge/state-badge';

/**
 * There is no `GET /api/servers/:name/:instance` endpoint — `stack inventory`
 * returns every instance in one document, so the backend's contract does too.
 * This page fetches the whole server (same request `ServerDetailPage` makes)
 * and picks its instance out client-side.
 */
@Component({
  selector: 'app-instance-detail',
  imports: [RouterLink, RelativeTimePipe, BytesPipe, StateBadge, MetaChip, DeployHistory],
  templateUrl: './instance-detail.html',
})
export class InstanceDetailPage {
  // Bound from the :name and :instance route segments.
  readonly name = input.required<string>();
  readonly instance = input.required<string>();

  private readonly serversService = inject(ServersService);
  private readonly metricsService = inject(MetricsService);
  private readonly router = inject(Router);

  protected readonly detail = this.serversService.serverDetail(this.name);

  protected readonly server = computed(() => this.detail.value());

  readonly found = computed(() =>
    this.server()?.instances.find((i) => i.name === this.instance()),
  );

  protected readonly deployHistoryDays = signal(90);
  protected readonly deployHistory = this.metricsService.deployHistory(
    this.name,
    this.instance,
    this.deployHistoryDays,
  );

  /** 404 on the server itself vs. its instance simply not existing on it. */
  protected readonly serverNotFound = computed(() => {
    const error = this.detail.error() as { status?: number } | undefined;
    return error?.status === 404;
  });

  /** Always the parent server, not browser history — a bookmarked/refreshed instance URL has no in-app history to go back to. */
  protected goBack(): void {
    this.router.navigate(['/servers', this.name()]);
  }
}
