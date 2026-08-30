import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { ActionsService } from '../actions/actions.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../shared/audit/audit.service';
import { SshTarget } from '../shared/ssh/interfaces/ssh-target.interface';
import { COMMANDS, CommandRequest } from '../shared/ssh/ssh-commands';
import { SshService } from '../shared/ssh/ssh.service';
import { CreateInstanceRequest, InstancePlan } from './interfaces/instance-plan.interface';

/** As `add_instance.py` accepts them. Checked here too, to fail before the round trip. */
const NAME = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const DOMAIN = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/;
const DATABASE = /^[a-z0-9_]{1,64}$/;
const MAX_DOMAINS = 10;

/** What `stack add --json` prints, before the field names are turned round. */
interface RawPlan {
  instance: string;
  app: string;
  client: string;
  domains: string[];
  engine: string;
  database: string;
  db_user: string;
  secrets_file: string;
  reused_secrets: boolean;
  pending_variables: string[];
  planned?: boolean;
  written?: boolean;
}

/**
 * Creating an instance: the one action whose subject does not exist yet.
 *
 * Two calls of the same command. `preview` is `--dry-run` — it validates
 * everything, works out the database and the variables still to fill in, and
 * writes nothing; `create` does it for real. Both answers come from the server,
 * so what the panel promises and what happens are the same code.
 *
 * The gates are `ActionsService`'s wherever they apply, reused rather than
 * rebuilt — except the instance check, which is the one gate that has to be
 * inverted here: `resolve()` refuses a name that is not an instance, and this
 * is the command whose name must not be one yet.
 */
@Injectable()
export class InstancesService {
  private readonly logger = new Logger(InstancesService.name);

  constructor(
    private readonly actions: ActionsService,
    private readonly ssh: SshService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
  ) {}

  async preview(serverName: string, body: CreateInstanceRequest): Promise<InstancePlan> {
    const request = this.request('addPreview', body);
    const { target } = await this.actions.resolve(serverName, request);
    return this.parse(serverName, await this.send(serverName, target, request));
  }

  async create(
    serverName: string,
    body: CreateInstanceRequest,
    actor: string,
  ): Promise<InstancePlan> {
    const request = this.request('add', body);
    const { target, key } = await this.actions.resolve(serverName, request);

    return this.actions.withLock(key, async () => {
      let raw: string;
      try {
        raw = await this.send(serverName, target, request);
      } catch (error) {
        await this.record(actor, serverName, body, false, messageOf(error));
        throw error;
      }

      const plan = this.parse(serverName, raw);
      await this.record(actor, serverName, body, true);

      // Until the cache is refreshed the instance exists on the machine and
      // nowhere else, so every gate in the panel — including the one that
      // guards `deploy` — would still refuse to believe in it. Failing this
      // must not fail the creation: the scheduled refresh would pick it up
      // anyway, several minutes later.
      try {
        await this.inventory.refreshServer(serverName);
      } catch (error) {
        this.logger.warn(`'${body.instance}' was created but ${serverName} did not refresh: ${messageOf(error)}`);
      }

      return plan;
    });
  }

  private async send(
    serverName: string,
    target: SshTarget,
    request: CommandRequest,
  ): Promise<string> {
    try {
      return await this.ssh.run(target, request, COMMANDS[request.command].timeoutMs ?? undefined);
    } catch (error) {
      throw new BadRequestException(this.actions.describe(messageOf(error)));
    }
  }

  private parse(serverName: string, raw: string): InstancePlan {
    let plan: RawPlan;
    try {
      plan = JSON.parse(raw) as RawPlan;
    } catch {
      // An older `stack` reaches the dispatcher's allowlist but not this
      // command's contract. Say which side is behind rather than "bad JSON".
      throw new BadRequestException(
        `'${serverName}' returned no plan — its \`stack\` may predate \`add --json\`.`,
      );
    }

    return {
      instance: plan.instance,
      app: plan.app,
      client: plan.client ?? '',
      domains: plan.domains ?? [],
      engine: plan.engine ?? '',
      database: plan.database ?? '',
      dbUser: plan.db_user ?? '',
      secretsFile: plan.secrets_file,
      reusedSecrets: Boolean(plan.reused_secrets),
      pendingVariables: plan.pending_variables ?? [],
      planned: Boolean(plan.planned),
    };
  }

  /**
   * The same rules `add_instance.py` applies, so a typo is caught before an SSH
   * round trip and reported like everything else in the panel.
   *
   * Not the boundary — the dispatcher refuses on its own terms whatever this
   * misses, and the rules that matter most are checked only on the server,
   * where the catalogue and the declaration are.
   */
  private request(command: 'add' | 'addPreview', body: CreateInstanceRequest): CommandRequest {
    const instance = (body.instance ?? '').trim();
    const app = (body.app ?? '').trim();
    const client = (body.client ?? '').trim();
    const database = (body.database ?? '').trim();
    const domains = (body.domains ?? []).map((d) => (typeof d === 'string' ? d.trim().toLowerCase() : ''));

    if (!NAME.test(instance)) {
      throw new BadRequestException(
        `'${instance}' is not an instance name: lowercase letters, digits and hyphens, up to 32 characters`,
      );
    }
    if (!NAME.test(app)) throw new BadRequestException(`'${app}' is not an application name`);
    if (client && !NAME.test(client)) {
      throw new BadRequestException(`'${client}' is not a client name`);
    }
    if (database && !DATABASE.test(database)) {
      throw new BadRequestException(
        `'${database}' is not a database name: lowercase letters, digits and underscores`,
      );
    }
    if (domains.length === 0) throw new BadRequestException('An instance needs at least one domain');
    if (domains.length > MAX_DOMAINS) {
      throw new BadRequestException(`An instance takes at most ${MAX_DOMAINS} domains`);
    }
    for (const domain of domains) {
      if (!DOMAIN.test(domain)) throw new BadRequestException(`'${domain}' is not a domain`);
    }
    if (new Set(domains).size !== domains.length) {
      throw new BadRequestException('The same domain is listed twice');
    }

    return {
      command,
      argument: instance,
      create: {
        app,
        domains,
        ...(client ? { client } : {}),
        ...(database ? { database } : {}),
        ...(body.reuseSecrets ? { reuseSecrets: true } : {}),
      },
    };
  }

  /** What was declared, which is public information — no password is in it. */
  private record(
    actor: string,
    serverName: string,
    body: CreateInstanceRequest,
    succeeded: boolean,
    error?: string,
  ): Promise<void> {
    return this.audit.record({
      actor,
      action: 'stack add',
      target: `${serverName}/${body.instance}`,
      detail: {
        app: body.app,
        domains: body.domains,
        client: body.client || null,
        database: body.database || null,
        reuseSecrets: Boolean(body.reuseSecrets),
        ...(error ? { error } : {}),
      },
      succeeded,
    });
  }
}

/**
 * The reason out of a failed run, without the plumbing around it.
 *
 * `stack` refuses with `error: <reason>`, wrapped by SshService in
 * `<server>: '<command>' exited 1: …`. The operator wants the reason; the rest
 * says only that SSH was involved. The full text is still what reaches the log.
 */
function messageOf(error: unknown): string {
  const full = error instanceof Error ? error.message : String(error);
  const reason = /(?:^|:\s)error:\s*(.+)$/s.exec(full);
  return reason ? reason[1].trim() : full;
}
