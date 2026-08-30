import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CatalogueService } from '../../core/services/catalogue.service';
import { valueOr } from '../../shared/resource-value';
import { StateBadge } from '../../shared/ui/state-badge/state-badge';

/**
 * The catalogue: what applications exist, independent of what any one machine
 * runs. The server pages answer the other direction — this one answers "what
 * is this app made of, and where does it run", which nothing else could.
 */
@Component({
  selector: 'app-apps',
  imports: [RouterLink, StateBadge],
  templateUrl: './apps.html',
})
export class Apps {
  private readonly catalogueService = inject(CatalogueService);

  protected readonly resource = this.catalogueService.catalogue();
  protected readonly catalogue = computed(() => valueOr(this.resource, undefined));
  protected readonly apps = computed(() => this.catalogue()?.apps ?? []);

  /** Which app's detail is open. Only one at a time: these are long. */
  protected readonly expanded = signal<string | null>(null);

  protected readonly deployedCount = computed(
    () => this.apps().filter((a) => a.deployments.length > 0).length,
  );

  protected toggle(name: string): void {
    this.expanded.update((current) => (current === name ? null : name));
  }

  /** Distinct clients an app serves — the number that says what a change touches. */
  protected clientsOf(app: { deployments: { client: string | null }[] }): string[] {
    return [...new Set(app.deployments.map((d) => d.client).filter((c): c is string => !!c))];
  }
}
