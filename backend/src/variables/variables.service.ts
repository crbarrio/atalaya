import { BadRequestException, Injectable } from '@nestjs/common';

import { ActionsService } from '../actions/actions.service';
import { AuditService } from '../shared/audit/audit.service';
import { COMMANDS } from '../shared/ssh/ssh-commands';
import { SshService } from '../shared/ssh/ssh.service';
import {
  VariablesChange,
  VariablesReport,
  VariablesWriteResult,
  EnvVariable,
} from './interfaces/variables.interface';

/** As `write_secrets.py` accepts them. Checked here too, to fail before the round trip. */
const NAME = /^[A-Z][A-Z0-9_]*$/;
const MAX_VALUE = 4096;

/** What `stack secrets --json` prints, before the field names are turned round. */
interface RawReport {
  instance: string;
  app: string | null;
  file: string;
  exists: boolean;
  mode: string | null;
  modified_at: number | null;
  variables: EnvVariable[];
}

/**
 * The variables of an instance: which it declares, which are set, and the way
 * to change them.
 *
 * A value only ever travels one way. It arrives in a request body, goes out on
 * the SSH command's standard input, and is gone — it is not stored, not logged,
 * not audited and not returned. Everything this service hands back is names.
 *
 * The gates are `ActionsService`'s, reused rather than rebuilt: the same check
 * that the instance exists, and the same per-instance lock, so writing a
 * variable cannot overlap a deploy of that instance.
 */
@Injectable()
export class VariablesService {
  constructor(
    private readonly actions: ActionsService,
    private readonly ssh: SshService,
    private readonly audit: AuditService,
  ) {}

  async report(serverName: string, instance: string): Promise<VariablesReport> {
    const request = { command: 'secrets' as const, argument: instance };
    const { target } = await this.actions.resolve(serverName, request);

    let raw: string;
    try {
      raw = await this.ssh.run(target, request, COMMANDS.secrets.timeoutMs ?? undefined);
    } catch (error) {
      throw new BadRequestException(this.actions.describe(messageOf(error)));
    }

    let report: RawReport;
    try {
      report = JSON.parse(raw) as RawReport;
    } catch {
      // An older `stack` prints its usage and exits 0, which parses as nothing.
      throw new BadRequestException(
        `'${serverName}' returned no variable data — its \`stack\` may predate \`secrets --json\`.`,
      );
    }

    return {
      instance: report.instance,
      app: report.app,
      file: report.file,
      exists: report.exists,
      mode: report.mode,
      modifiedAt: report.modified_at,
      variables: report.variables ?? [],
    };
  }

  async write(
    serverName: string,
    instance: string,
    change: VariablesChange,
    actor: string,
  ): Promise<VariablesWriteResult> {
    const names = this.check(change);

    const request = { command: 'secretsSet' as const, argument: instance };
    const { target, key } = await this.actions.resolve(serverName, request);

    return this.actions.withLock(key, async () => {
      // The document goes on stdin. As arguments these values would be visible
      // in `ps` on the server for as long as the command runs.
      const payload = JSON.stringify({ set: change.set ?? {}, unset: change.unset ?? [] });

      let raw: string;
      try {
        raw = await this.ssh.runWithInput(
          target,
          request,
          payload,
          COMMANDS.secretsSet.timeoutMs ?? undefined,
        );
      } catch (error) {
        const message = this.actions.describe(messageOf(error));
        await this.record(actor, serverName, instance, names, false, message);
        throw new BadRequestException(message);
      }

      let result: VariablesWriteResult & { ok: boolean };
      try {
        result = JSON.parse(raw) as VariablesWriteResult & { ok: boolean };
      } catch {
        await this.record(actor, serverName, instance, names, false, 'unreadable response');
        throw new BadRequestException(
          `'${serverName}' returned no result — its \`stack\` may predate \`secrets --set\`.`,
        );
      }

      await this.record(actor, serverName, instance, names, true);
      return {
        file: result.file,
        created: result.created,
        changed: result.changed ?? [],
        unset: result.unset ?? [],
      };
    });
  }

  /**
   * The same rules `write_secrets.py` applies, so a mistake is caught before an
   * SSH round trip and reported the same way as everything else in the panel.
   *
   * Not the boundary. The server refuses on its own terms whatever this misses,
   * and the one rule that matters — a name must be declared in apps.json — is
   * checked only there, where the catalogue is.
   */
  private check(change: VariablesChange): string[] {
    const set = change.set ?? {};
    const unset = change.unset ?? [];

    if (typeof set !== 'object' || set === null || Array.isArray(set) || !Array.isArray(unset)) {
      throw new BadRequestException("'set' must be an object and 'unset' a list of names");
    }
    if (Object.keys(set).length === 0 && unset.length === 0) {
      throw new BadRequestException('Nothing to change');
    }

    for (const [name, value] of Object.entries(set)) {
      if (!NAME.test(name)) throw new BadRequestException(`'${name}' is not a variable name`);
      if (typeof value !== 'string') {
        throw new BadRequestException(`The value of '${name}' must be text`);
      }
      if (value === '') {
        throw new BadRequestException(`'${name}' has no value — unset it instead of emptying it`);
      }
      if (value.length > MAX_VALUE) {
        throw new BadRequestException(`The value of '${name}' is longer than ${MAX_VALUE} characters`);
      }
      // eslint-disable-next-line no-control-regex
      if (/[\u0000-\u001f\u007f]/.test(value)) {
        throw new BadRequestException(
          `The value of '${name}' has a line break or control character in it, which an env file cannot hold`,
        );
      }
    }

    for (const name of unset) {
      if (typeof name !== 'string' || !NAME.test(name)) {
        throw new BadRequestException(`'${String(name)}' is not a variable name`);
      }
      if (name in set) throw new BadRequestException(`'${name}' is both set and unset`);
    }

    return [...Object.keys(set), ...unset].sort();
  }

  /** Names only. This is the one place a value could reach durable storage. */
  private record(
    actor: string,
    serverName: string,
    instance: string,
    names: string[],
    succeeded: boolean,
    error?: string,
  ): Promise<void> {
    return this.audit.record({
      actor,
      action: 'stack secrets --set',
      target: `${serverName}/${instance}`,
      detail: { variables: names, ...(error ? { error } : {}) },
      succeeded,
    });
  }
}

/**
 * The reason out of a failed run, without the plumbing around it.
 *
 * `stack` refuses with `error: <reason>`, wrapped by SshService in
 * `<server>: '<command>' exited 1: …`. The operator wants the reason; the rest
 * says only that SSH was involved, which they can see from the screen they are
 * on. The full text is still what reaches the log.
 */
function messageOf(error: unknown): string {
  const full = error instanceof Error ? error.message : String(error);
  const reason = /(?:^|:\s)error:\s*(.+)$/s.exec(full);
  return reason ? reason[1].trim() : full;
}
