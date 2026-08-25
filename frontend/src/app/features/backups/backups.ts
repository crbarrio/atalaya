import { Component, computed, inject } from '@angular/core';

import { ServersService } from '../../core/services/servers.service';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { MetaChip } from '../../shared/ui/meta-chip/meta-chip';

/**
 * PLAN.md asks for the last full AND the last incremental backup per server.
 * What is actually available today is a single "last run, whichever mode"
 * status from `stack inventory` — `backup.sh` overwrites one status file
 * regardless of mode. The two modes DO exist as separate Prometheus series
 * (`stack_backup_success{mode="full"}` / `{mode="incremental"}`), so the
 * per-mode split belongs to a Prometheus query later, not to this table.
 * Shown honestly as one row per server for now, rather than inventing a
 * second column with nothing behind it.
 */
@Component({
  selector: 'app-backups',
  imports: [RelativeTimePipe, MetaChip],
  templateUrl: './backups.html',
})
export class Backups {
  private readonly serversService = inject(ServersService);

  readonly servers = this.serversService.list();
  readonly isLoading = this.serversService.isLoading;
  readonly error = this.serversService.error;

  readonly ok = computed(() => this.servers().filter((s) => s.backup.status === 'OK').length);
  readonly failing = computed(
    () => this.servers().filter((s) => s.backup.status !== 'OK').length,
  );
}
