import { Component, computed, inject } from '@angular/core';

import { ServersService } from '../../core/services/servers.service';
import { MetaChip } from '../../shared/ui/meta-chip/meta-chip';
import { ServerCard } from '../overview/server-card/server-card';

/**
 * The fleet, one card per machine. Until now this route loaded the Overview
 * component, so the two menu entries were the same page twice.
 */
@Component({
  selector: 'app-servers',
  imports: [ServerCard, MetaChip],
  templateUrl: './servers.html',
})
export class Servers {
  private readonly serversService = inject(ServersService);

  readonly servers = this.serversService.list();
  readonly isLoading = this.serversService.isLoading;
  readonly error = this.serversService.error;

  readonly totalInstances = computed(() =>
    this.servers().reduce((sum, s) => sum + s.counts.total, 0),
  );

  /**
   * A host server has no backups to report — `null` there means "not
   * applicable", not "never ran", so only its health counts.
   */
  readonly issues = computed(
    () =>
      this.servers().filter(
        (s) => s.health !== 'ok' || (s.kind !== 'host' && s.backup.status !== 'OK'),
      ).length,
  );
}
