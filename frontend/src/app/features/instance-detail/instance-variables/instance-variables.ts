import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';

import { EnvVariable } from '../../../core/models/variables.model';
import { VariablesService } from '../../../core/services/variables.service';
import { errorMessage } from '../../../shared/error-message';
import { valueOr } from '../../../shared/resource-value';

/**
 * The variables of one instance: which it declares, which are set, and the way
 * to change them.
 *
 * Write-only, as PLAN.md requires. A value is typed in and sent; it is never
 * fetched, never rendered, and the input starts empty every time — there is
 * nothing to prefill it with, because nothing on this side ever knew it.
 *
 * Edits are held here until saved, so one request carries the whole change and
 * leaves one audit row, and so the operator can see what is about to happen
 * before it does.
 */
@Component({
  selector: 'app-instance-variables',
  imports: [DatePipe],
  templateUrl: './instance-variables.html',
})
export class InstanceVariables {
  readonly server = input.required<string>();
  readonly instance = input.required<string>();

  /** Asks the page to redeploy the running version, which is what applies a change. */
  readonly apply = output<void>();

  private readonly variables = inject(VariablesService);

  protected readonly resource = this.variables.report(this.server, this.instance);
  protected readonly report = computed(() => valueOr(this.resource, undefined));

  protected readonly expanded = signal(false);

  /** Values waiting to be saved. Cleared on save, and never read back from anywhere. */
  private readonly edits = signal<Record<string, string>>({});
  private readonly removals = signal<string[]>([]);

  /** Which row has its input open, and what has been typed into it. */
  protected readonly editing = signal<string | null>(null);
  protected readonly draft = signal('');

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Names written in the last save: the banner's reason for existing. */
  protected readonly savedNames = signal<string[]>([]);

  protected readonly rows = computed(() => this.report()?.variables ?? []);

  protected readonly counts = computed(() => {
    const all = this.rows();
    const required = all.filter((v) => v.kind === 'required');
    return {
      total: all.length,
      set: all.filter((v) => v.set).length,
      missing: required.filter((v) => !v.set).length,
    };
  });

  /** The change as it would be sent. Also what the confirmation lists. */
  protected readonly pending = computed(() => ({
    set: Object.keys(this.edits()).sort(),
    unset: [...this.removals()].sort(),
  }));

  protected readonly hasPending = computed(
    () => this.pending().set.length + this.pending().unset.length > 0,
  );

  /** Empty rather than fatal: a server without the new `stack` still renders the page. */
  protected readonly unavailable = computed(() => {
    const error = this.resource.error();
    return error ? errorMessage(error) : null;
  });

  protected isEdited(name: string): boolean {
    return name in this.edits();
  }

  protected isRemoved(name: string): boolean {
    return this.removals().includes(name);
  }

  /** What the row should say it will become, once saved. */
  protected pendingState(variable: EnvVariable): 'set' | 'unset' | null {
    if (this.isEdited(variable.name)) return 'set';
    if (this.isRemoved(variable.name)) return 'unset';
    return null;
  }

  protected open(name: string): void {
    this.error.set(null);
    this.editing.set(name);
    // Always empty. There is no existing value to offer, by design.
    this.draft.set('');
  }

  protected cancel(): void {
    this.editing.set(null);
    this.draft.set('');
  }

  protected keep(): void {
    const name = this.editing();
    const value = this.draft();
    if (!name || !value) return;
    this.edits.update((current) => ({ ...current, [name]: value }));
    this.removals.update((current) => current.filter((n) => n !== name));
    this.cancel();
  }

  protected remove(name: string): void {
    this.error.set(null);
    this.edits.update((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    this.removals.update((current) => (current.includes(name) ? current : [...current, name]));
  }

  protected undo(name: string): void {
    this.edits.update((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    this.removals.update((current) => current.filter((n) => n !== name));
  }

  protected discard(): void {
    this.edits.set({});
    this.removals.set([]);
    this.cancel();
    this.error.set(null);
  }

  protected async save(): Promise<void> {
    if (!this.hasPending() || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);

    const change = { set: this.edits(), unset: [...this.removals()] };
    const names = [...this.pending().set, ...this.pending().unset];

    try {
      await this.variables.write(this.server(), this.instance(), change);
      this.discard();
      this.savedNames.set(names);
      this.resource.reload();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected applyNow(): void {
    this.savedNames.set([]);
    this.apply.emit();
  }

  protected dismiss(): void {
    this.savedNames.set([]);
  }
}
