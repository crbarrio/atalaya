import { Component, computed, inject } from '@angular/core';

import { ServersService } from '../../core/services/servers.service';
import { MetaChip } from '../../shared/ui/meta-chip/meta-chip';
import { ServerCard } from './server-card/server-card';

@Component({
  selector: 'app-overview',
  imports: [ServerCard, MetaChip],
  templateUrl: './overview.html',
})
export class Overview {
  private readonly serversService = inject(ServersService);

  readonly servers = this.serversService.list();
  readonly isLoading = this.serversService.isLoading;
  readonly error = this.serversService.error;

  readonly totalInstances = computed(() =>
    this.servers().reduce((sum, s) => sum + s.counts.total, 0),
  );
  
  readonly issues = computed(
    () => this.servers().filter((s) => s.health !== 'ok' || s.backup.status !== 'OK').length,
  );
}
