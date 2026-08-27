import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Observable } from 'rxjs';

import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../shared/audit/audit.service';
import { COMMANDS, CommandName, CommandRequest } from '../shared/ssh/ssh-commands';
import { CommandEvent, SshService } from '../shared/ssh/ssh.service';
import { StackVersions } from './interfaces/versions.interface';
import { SshTarget } from '../shared/ssh/interfaces/ssh-target.interface';

/**
 * Runs `stack` on a server, and is the only place that decides whether an
 * action is allowed to start.
 *
 * Three gates before anything reaches SSH: the command must be in the
 * catalogue, the instance must exist, and no other mutating action may be
 * running on it. The server-side dispatcher enforces its own list regardless —
 * these gates exist to fail early and explain why, not to be the last line.
 */
@Injectable()
export class ActionsService {
  private readonly logger = new Logger(ActionsService.name);

  /**
   * Mutating actions in flight, keyed `server/instance`. In memory because
   * there is one backend process; a second one would need this in the
   * database, and that should be a deliberate change rather than a surprise.
   */
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ssh: SshService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
  ) {}

  /** Collected output, for the short read-only commands. */
  async run(serverName: string, request: CommandRequest, actor: string): Promise<string> {
    const { target } = await this.resolve(serverName, request);
    const spec = COMMANDS[request.command];

    try {
      const output = await this.ssh.run(target, request, spec.timeoutMs ?? undefined);
      if (spec.kind === 'mutate') {
        await this.audit.record({ ...this.entry(serverName, request, actor), succeeded: true });
      }
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (spec.kind === 'mutate') {
        await this.audit.record({
          ...this.entry(serverName, request, actor),
          detail: { ...this.entry(serverName, request, actor).detail, error: message },
          succeeded: false,
        });
      }
      throw new BadRequestException(this.explain(message));
    }
  }

  /**
   * Which versions exist for an instance, and which one a bare `deploy` would
   * pick. Read-only, so no lock and no audit row.
   *
   * Parsed rather than shown: the printed form is prose with ANSI and unicode
   * in it, which is exactly why `stack` grew a `--json` mode for this.
   */
  async versions(serverName: string, instance: string): Promise<StackVersions> {
    const request: CommandRequest = { command: 'versions', argument: instance, json: true };
    const { target } = await this.resolve(serverName, request);

    let raw: string;
    try {
      raw = await this.ssh.run(target, request, COMMANDS.versions.timeoutMs ?? undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(this.explain(message));
    }

    try {
      return JSON.parse(raw) as StackVersions;
    } catch {
      // An older `stack` without --json prints its usage and exits 0, which
      // parses as nothing. Say which side is behind rather than "bad JSON".
      throw new BadRequestException(
        `'${serverName}' returned no version data — its \`stack\` may predate \`versions --json\`.`,
      );
    }
  }

  /**
   * Streamed output. The lock is taken when the caller subscribes and released
   * when the stream ends for any reason — completion, failure, or the viewer
   * navigating away — so a disconnected deploy cannot leave the instance
   * locked forever.
   */
  stream(serverName: string, request: CommandRequest, actor: string): Observable<CommandEvent> {
    const spec = COMMANDS[request.command];
    const mutating = spec.kind === 'mutate';

    return new Observable<CommandEvent>((subscriber) => {
      let lockedKey: string | null = null;
      let exitCode: number | null = null;
      let cancelled = false;
      let inner: { unsubscribe(): void } | undefined;

      void (async () => {
        let target: SshTarget;
        try {
          const resolved = await this.resolve(serverName, request);
          if (mutating) {
            if (this.running.has(resolved.key)) {
              throw new ConflictException(
                `Another action is already running on '${resolved.key}'`,
              );
            }
            this.running.add(resolved.key);
            lockedKey = resolved.key;
          }
          target = resolved.target;
        } catch (error) {
          subscriber.error(error);
          return;
        }

        // Unsubscribed while resolving: nothing to start, and the lock the
        // teardown below could not see yet has to go.
        if (cancelled) {
          if (lockedKey) this.running.delete(lockedKey);
          return;
        }

        inner = this.ssh.stream(target, request).subscribe({
          next: (event) => {
            if (event.type === 'exit') exitCode = event.code;
            subscriber.next(event);
          },
          error: (error: Error) => {
            void this.recordIfMutating(mutating, serverName, request, actor, exitCode, error);
            subscriber.error(new BadRequestException(this.explain(error.message)));
          },
          complete: () => {
            void this.recordIfMutating(mutating, serverName, request, actor, exitCode);
            subscriber.complete();
          },
        });
      })();

      // Runs on completion, failure and unsubscribe alike — so a viewer closing
      // the tab mid-deploy releases the lock and kills the SSH session.
      return () => {
        cancelled = true;
        inner?.unsubscribe();
        if (lockedKey) {
          this.running.delete(lockedKey);
          lockedKey = null;
        }
      };
    });
  }

  private async recordIfMutating(
    mutating: boolean,
    serverName: string,
    request: CommandRequest,
    actor: string,
    exitCode: number | null,
    error?: Error,
  ): Promise<void> {
    if (!mutating) return;
    const base = this.entry(serverName, request, actor);
    await this.audit.record({
      ...base,
      detail: { ...base.detail, exitCode, ...(error ? { error: error.message } : {}) },
      succeeded: !error && exitCode === 0,
    });
  }

  /** Whether a mutating action is in flight, so the UI can say so. */
  isRunning(serverName: string, instance: string): boolean {
    return this.running.has(`${serverName}/${instance}`);
  }

  /**
   * Server, instance and target. The instance is checked against the cached
   * `Instance` table — PLAN.md requires a made-up name be rejected before SSH
   * is touched. The cache can lag a freshly added instance, so a miss triggers
   * one refresh and a re-check before giving up.
   */
  private async resolve(
    serverName: string,
    request: CommandRequest,
  ): Promise<{ target: SshTarget; key: string }> {
    const server = await this.prisma.server.findUnique({ where: { name: serverName } });
    if (!server) throw new NotFoundException(`Unknown server '${serverName}'`);
    if (server.kind !== 'stack') {
      throw new BadRequestException(`'${serverName}' runs no stack: there is nothing to command`);
    }

    const spec = COMMANDS[request.command];
    if (spec.needsInstance) {
      const instance = request.argument;
      if (!instance) throw new BadRequestException(`'${request.command}' needs an instance`);

      if (!(await this.instanceExists(server.id, instance))) {
        await this.inventory.refreshServer(serverName);
        if (!(await this.instanceExists(server.id, instance))) {
          throw new NotFoundException(`'${instance}' is not an instance on '${serverName}'`);
        }
      }
    }

    return {
      target: {
        name: server.name,
        host: server.host,
        port: server.sshPort,
        user: server.sshUser,
        keyPath: server.sshKeyPath,
        stackPath: server.stackPath,
      },
      key: `${serverName}/${request.argument ?? request.command}`,
    };
  }

  private async instanceExists(serverId: string, name: string): Promise<boolean> {
    const row = await this.prisma.instance.findUnique({
      where: { serverId_name: { serverId, name } },
      select: { id: true },
    });
    return row !== null;
  }

  private entry(serverName: string, request: CommandRequest, actor: string) {
    return {
      actor,
      action: `stack ${request.command}` as string,
      target: `${serverName}/${request.argument ?? ''}`.replace(/\/$/, ''),
      detail: { command: request.command, argument: request.argument, version: request.version },
    };
  }

  /**
   * A server without the dispatcher fails with sudo's own message, which says
   * nothing useful to whoever is looking at the panel.
   */
  private explain(message: string): string {
    if (/a (password|terminal) is required|not allowed to execute/i.test(message)) {
      return 'This server has not been set up for actions yet — re-run setup-server.sh on it.';
    }
    if (/No such file or directory|atalaya-stack/i.test(message) && /not found/i.test(message)) {
      return 'The command dispatcher is missing on this server — re-run setup-server.sh on it.';
    }
    return message;
  }
}

export type { CommandName };
