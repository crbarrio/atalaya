import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { ActionCommand } from '../../core/models/action.model';
import { ActionsService } from '../../core/services/actions.service';
import { MetricsService } from '../../core/services/metrics.service';
import { ServersService } from '../../core/services/servers.service';
import { BytesPipe } from '../../shared/pipes/bytes.pipe';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { commandRunner } from '../../shared/command-runner';
import { valueOr } from '../../shared/resource-value';
import { CommandConsole } from '../../shared/ui/command-console/command-console';
import { DeployHistory } from '../../shared/ui/deploy-history/deploy-history';
import { MetaChip } from '../../shared/ui/meta-chip/meta-chip';
import { StateBadge } from '../../shared/ui/state-badge/state-badge';
import { InstanceVariables } from './instance-variables/instance-variables';

/** Actions that change the instance, and therefore need confirming first. */
const DESTRUCTIVE = new Set(['deploy', 'rollback', 'stop', 'start']);

/**
 * There is no `GET /api/servers/:name/:instance` endpoint — `stack inventory`
 * returns every instance in one document, so the backend's contract does too.
 * This page fetches the whole server (same request `ServerDetailPage` makes)
 * and picks its instance out client-side.
 */
@Component({
  selector: 'app-instance-detail',
  imports: [
    RouterLink,
    RelativeTimePipe,
    BytesPipe,
    StateBadge,
    MetaChip,
    DeployHistory,
    CommandConsole,
    InstanceVariables,
  ],
  templateUrl: './instance-detail.html',
})
export class InstanceDetailPage {
  // Bound from the :name and :instance route segments.
  readonly name = input.required<string>();
  readonly instance = input.required<string>();

  private readonly serversService = inject(ServersService);
  private readonly metricsService = inject(MetricsService);
  private readonly actionsService = inject(ActionsService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

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

  /** Empty rather than fatal when Prometheus is unreachable — see valueOr. */
  protected readonly deploys = computed(() => valueOr(this.deployHistory, []));

  /** 404 on the server itself vs. its instance simply not existing on it. */
  protected readonly serverNotFound = computed(() => {
    const error = this.detail.error() as { status?: number } | undefined;
    return error?.status === 404;
  });

  /** Always the parent server, not browser history — a bookmarked/refreshed instance URL has no in-app history to go back to. */
  protected goBack(): void {
    this.router.navigate(['/servers', this.name()]);
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  protected readonly runner = commandRunner();

  /**
   * Which action is waiting to be confirmed, by name. Same shape as the keyed
   * confirmation in notification-channels: one signal, no dialog, and pressing
   * a second action while one is pending simply moves the prompt.
   */
  protected readonly confirming = signal<string | null>(null);

  protected readonly actions: { command: ActionCommand; label: string; hint: string }[] = [
    { command: 'deploy', label: 'Deploy', hint: 'Deploy the newest published version' },
    { command: 'rollback', label: 'Rollback', hint: 'Go back to the previous version' },
    { command: 'stop', label: 'Stop', hint: 'Containers and routing down; data is kept' },
    { command: 'start', label: 'Start', hint: 'Bring back the version that was running' },
  ];

  /**
   * Read on entering the page, so the version card reports what `stack` sees
   * now. The inventory cache only knows what it last read, which is wrong the
   * moment anything is deployed outside the panel.
   */
  protected readonly versions = this.actionsService.versions(this.name, this.instance);

  /** Undefined while loading, or when stack could not be reached. */
  protected readonly versionInfo = computed(() => valueOr(this.versions, undefined));

  /** Which tag the deploy confirmation has selected. Null means whatever `stack` would pick. */
  protected readonly chosenVersion = signal<string | null>(null);

  /**
   * Tags offered for deploy, newest first. Services of an instance deploy on
   * the same tag, so the first service's list is the instance's list; a tag
   * missing from another service would fail in `stack`, not here.
   */
  protected readonly availableVersions = computed(
    () => valueOr(this.versions, undefined)?.services[0]?.versions ?? [],
  );

  /** Whether a bare deploy would actually change anything. */
  protected readonly deployWouldChange = computed(() => {
    const v = valueOr(this.versions, undefined);
    return v ? v.chosen !== null && v.chosen !== v.running : false;
  });

  protected ask(command: string): void {
    this.chosenVersion.set(null);
    this.confirming.set(command);
  }

  protected cancel(): void {
    this.confirming.set(null);
  }

  protected run(command: ActionCommand): void {
    this.confirming.set(null);
    const version = command === 'deploy' ? (this.chosenVersion() ?? undefined) : undefined;
    this.runner.start(this.name(), command, { instance: this.instance(), version });
    // The inventory cache still shows the old version until it is re-read.
    if (DESTRUCTIVE.has(command)) this.refreshAfter();
  }

  /** The raw `stack versions` output, for the detail a dropdown cannot carry. */
  protected showVersions(): void {
    this.confirming.set(null);
    this.runner.start(this.name(), 'versions', { instance: this.instance() });
  }

  /**
   * What makes an edited variable take effect. `stack start` redeploys the
   * version already recorded, so the containers are recreated with the new
   * environment without the instance also moving to a newer build — which is
   * what a bare `deploy` would do.
   */
  protected applyVariables(): void {
    this.run('start');
  }

  // ── Retiring ──────────────────────────────────────────────────────────────

  /**
   * Retiring is the one action with no undo button on this page, so it is the
   * one action that is not a click away from the others: it lives in its own
   * danger zone and asks for the instance name to be typed.
   *
   * That gate is not caution for its own sake. Building the server page's
   * danger zone deregistered the real test server by accident, because two
   * clicks land on "Deregister" then "Yes, deregister" in roughly the same
   * screen position. A name that has to be typed cannot be reached that way.
   */
  protected readonly confirmingRetire = signal(false);
  protected readonly retireTyped = signal('');

  /**
   * Whether the data goes too. Two commands, not a flag on one: the server
   * allowlists them separately and the audit trail names which was run.
   */
  protected readonly retireWithData = signal(false);

  /**
   * The second gate, and only for the destructive form. Typing the name proves
   * you meant this instance; this proves you meant the data as well, which is
   * the part that `stack add --reuse-secrets` cannot give back.
   */
  protected readonly dataUnderstood = signal(false);

  protected readonly retireArmed = computed(
    () =>
      this.retireTyped() === this.instance() && (!this.retireWithData() || this.dataUnderstood()),
  );

  /**
   * What the destructive form destroys, named rather than described.
   *
   * `volumes: null` means no backup has ever measured them — not that there are
   * none. Collapsing the two would have this screen promise nothing will be
   * deleted while `docker volume rm` is about to run, which is the one thing a
   * confirmation like this must never do.
   */
  protected readonly doomed = computed(() => {
    const instance = this.found();
    return {
      volumes: instance?.volumes ?? [],
      volumesKnown: instance?.volumes != null,
      database: instance?.database?.name ?? null,
    };
  });

  protected startRetire(): void {
    this.confirming.set(null);
    this.retireTyped.set('');
    this.retireWithData.set(false);
    this.dataUnderstood.set(false);
    this.confirmingRetire.set(true);
  }

  protected cancelRetire(): void {
    this.confirmingRetire.set(false);
    this.retireTyped.set('');
    this.retireWithData.set(false);
    this.dataUnderstood.set(false);
  }

  /** Switching between the two forms clears the acknowledgement, never inherits it. */
  protected chooseRetire(withData: boolean): void {
    this.retireWithData.set(withData);
    this.dataUnderstood.set(false);
  }

  protected retire(): void {
    if (!this.retireArmed()) return;
    const command: ActionCommand = this.retireWithData() ? 'retireWithData' : 'retire';
    this.confirmingRetire.set(false);
    this.runner.start(this.name(), command, { instance: this.instance() });
    this.leaveWhenRetired();
  }

  /**
   * The instance stops existing, so this page stops having anything to show.
   * The inventory cache is re-read first — otherwise the server page would
   * still list the instance that was just removed.
   */
  private leaveWhenRetired(): void {
    const check = setInterval(() => {
      if (this.runner.state() === 'running') return;
      clearInterval(check);
      if (this.runner.exitCode() !== 0) return; // Leave the output on screen to be read.
      void this.serversService.refresh(this.name()).finally(() => this.goBack());
    }, 1000);
    this.destroyRef.onDestroy(() => clearInterval(check));
  }

  protected showLogs(): void {
    this.confirming.set(null);
    this.runner.start(this.name(), 'logs', { instance: this.instance() });
  }

  /**
   * Re-reads the server once the command has finished, so the version and
   * state on this page stop showing what was true before it ran.
   */
  private refreshAfter(): void {
    const check = setInterval(() => {
      if (this.runner.state() === 'running') return;
      clearInterval(check);
      this.detail.reload();
      this.deployHistory.reload();
      this.versions.reload();
    }, 1000);
    this.destroyRef.onDestroy(() => clearInterval(check));
  }
}
