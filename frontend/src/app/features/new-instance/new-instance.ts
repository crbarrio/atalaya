import { DIALOG_DATA } from '@angular/cdk/dialog';
import { Component, computed, inject, output, signal } from '@angular/core';
import { Router } from '@angular/router';

import { CatalogueApp } from '../../core/models/catalogue.model';
import { CreateInstanceRequest, InstancePlan } from '../../core/models/instance-plan.model';
import { CatalogueService } from '../../core/services/catalogue.service';
import { InstancesService } from '../../core/services/instances.service';
import { errorMessage } from '../../shared/error-message';
import { valueOr } from '../../shared/resource-value';

/** The shapes `add_instance.py` accepts, so a typo is caught before a round trip. */
const NAME = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const DOMAIN = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/;
const DATABASE = /^[a-z0-9_]{1,64}$/;

/**
 * Declaring an instance on a server — the last thing that needed a terminal.
 *
 * Three steps, because the middle one is not decoration: `stack add --dry-run`
 * works out the database, its user and which variables will still be missing,
 * and that answer comes from the same code that will do the work. What the
 * operator confirms is therefore what happens, not a description of it written
 * here and liable to drift.
 *
 * Creating is not the end of it, so the last step says so: a declaration is not
 * a running application until the DNS points here, the variables are filled in
 * and a deploy has succeeded.
 */
@Component({
  selector: 'app-new-instance',
  templateUrl: './new-instance.html',
})
export class NewInstance {
  private readonly instancesService = inject(InstancesService);
  private readonly catalogueService = inject(CatalogueService);
  private readonly router = inject(Router);
  private readonly data = inject<{ server: string }>(DIALOG_DATA);

  readonly closed = output<void>();

  protected readonly server = this.data.server;

  private readonly catalogue = this.catalogueService.catalogue();
  protected readonly apps = computed(() => valueOr(this.catalogue, undefined)?.apps ?? []);

  protected readonly instance = signal('');
  protected readonly app = signal('');
  protected readonly domains = signal<string[]>(['']);
  protected readonly client = signal('');
  protected readonly database = signal('');
  /**
   * Offered only once the server has said it is needed. A secrets file left
   * behind by a `retire` without `--with-data` is the only reason to want it,
   * and showing the option unprompted would invite keeping a file that belongs
   * to a different instance.
   */
  protected readonly reuseSecrets = signal(false);
  protected readonly reuseOffered = signal(false);

  protected readonly plan = signal<InstancePlan | null>(null);
  protected readonly created = signal<InstancePlan | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly chosen = computed<CatalogueApp | undefined>(() =>
    this.apps().find((a) => a.name === this.app()),
  );

  /** What `stack` would call the database if nothing is typed — shown as the placeholder. */
  protected readonly defaultDatabase = computed(() =>
    this.instance().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
  );

  /** Where this instance already runs, so the same name is not declared twice by hand. */
  protected readonly alreadyHere = computed(() =>
    (this.chosen()?.deployments ?? []).filter((d) => d.server === this.server),
  );

  /**
   * The first thing wrong with the form, or null. One message rather than a
   * list: the fields are few and in order, and the button says which one to fix.
   */
  protected readonly problem = computed<string | null>(() => {
    if (!this.app()) return 'Choose an application';
    if (!NAME.test(this.instance())) {
      return 'The instance name takes lowercase letters, digits and hyphens';
    }
    const domains = this.filledDomains();
    if (domains.length === 0) return 'At least one domain is needed';
    for (const domain of domains) {
      if (!DOMAIN.test(domain)) return `'${domain}' is not a domain`;
    }
    if (new Set(domains).size !== domains.length) return 'The same domain is listed twice';
    if (this.client() && !NAME.test(this.client())) return 'The client name takes lowercase letters, digits and hyphens';
    if (this.database() && !DATABASE.test(this.database())) {
      return 'The database name takes lowercase letters, digits and underscores';
    }
    return null;
  });

  protected set(field: 'instance' | 'app' | 'client' | 'database', event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value.trim().toLowerCase();
    this[field].set(value);
    this.plan.set(null);
  }

  protected setDomain(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim().toLowerCase();
    this.domains.update((list) => list.map((d, i) => (i === index ? value : d)));
    this.plan.set(null);
  }

  protected addDomain(): void {
    this.domains.update((list) => [...list, '']);
  }

  protected removeDomain(index: number): void {
    this.domains.update((list) => list.filter((_, i) => i !== index));
    this.plan.set(null);
  }

  protected toggleReuse(event: Event): void {
    this.reuseSecrets.set((event.target as HTMLInputElement).checked);
    this.plan.set(null);
  }

  protected async preview(): Promise<void> {
    await this.send(() => this.instancesService.preview(this.server, this.request()), (plan) =>
      this.plan.set(plan),
    );
  }

  protected async create(): Promise<void> {
    await this.send(() => this.instancesService.create(this.server, this.request()), (plan) => {
      this.plan.set(null);
      this.created.set(plan);
    });
  }

  protected back(): void {
    this.plan.set(null);
  }

  protected open(): void {
    this.router.navigate(['/servers', this.server, this.created()!.instance]);
    this.onClose();
  }

  onClose(): void {
    this.closed.emit();
  }

  private async send(call: () => Promise<InstancePlan>, then: (plan: InstancePlan) => void): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      then(await call());
    } catch (error) {
      const message = errorMessage(error);
      this.error.set(message);
      // The server is the only thing that knows a secrets file is in the way.
      if (/--reuse-secrets/.test(message)) this.reuseOffered.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  private filledDomains(): string[] {
    return this.domains().filter((d) => d.length > 0);
  }

  private request(): CreateInstanceRequest {
    return {
      instance: this.instance(),
      app: this.app(),
      domains: this.filledDomains(),
      ...(this.client() ? { client: this.client() } : {}),
      ...(this.database() ? { database: this.database() } : {}),
      ...(this.reuseSecrets() ? { reuseSecrets: true } : {}),
    };
  }
}
