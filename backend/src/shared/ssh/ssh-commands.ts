/**
 * The commands atalaya is allowed to run, and the only place they are written.
 *
 * This is the plan's "never a free shell over SSH" as code: callers name a
 * command, and no function anywhere accepts a command string. Gaining a new
 * capability means adding an entry here, which is deliberate and shows up in
 * review.
 *
 * The same list exists again on each server, in the root-owned dispatcher
 * `infra/fleet/server-setup/setup-server.sh` installs. That duplication is the
 * point: this side is convenience and good errors, that side is the security
 * boundary. A bug here cannot widen what a server will accept.
 */

/** Absolute POSIX path with no shell metacharacters. */
const SAFE_PATH = /^\/[A-Za-z0-9._\-/]*$/;

/** Instance names, and image tags, as `stack` writes them. */
const SAFE_NAME = /^[a-z0-9][a-z0-9._-]*$/;

/** Where setup-server.sh installs the dispatcher. Fixed, never from the database. */
const DISPATCHER = '/usr/local/sbin/atalaya-stack';

export type CommandName =
  | 'inventory'
  | 'catalogue'
  | 'status'
  | 'versions'
  | 'logs'
  | 'deploy'
  | 'rollback'
  | 'start'
  | 'stop'
  | 'backup'
  | 'retire'
  | 'retireWithData'
  | 'secrets'
  | 'secretsSet';

export interface CommandSpec {
  /**
   * `read` never changes anything and needs no confirmation. `mutate` does,
   * and is serialised per instance. `inventory` is `read` and also the one
   * command that does not go through the dispatcher.
   */
  kind: 'read' | 'mutate';
  /** Whether output is streamed to the browser or collected and returned once. */
  streams: boolean;
  /** Wall-clock limit. `null` means none: `logs` follows until the viewer leaves. */
  timeoutMs: number | null;
  /** Whether the command names an instance. `backup` takes a mode instead. */
  needsInstance: boolean;
  /**
   * The dispatcher subcommand, when it is not the key. Reading and writing
   * variables are one subcommand on the server and two entries here, because
   * one of them is a `read` and the other a `mutate`.
   */
  subcommand?: string;
  /**
   * How the audit trail names it, when the key is an internal name rather than
   * what ran. `retireWithData` is this file's word for `retire --with-data`,
   * and the record of a deletion should say what was actually run.
   */
  label?: string;
}

export const COMMANDS: Record<CommandName, CommandSpec> = {
  // Runs unprivileged, directly, exactly as it always has. The whole panel
  // depends on it, so it must keep working on a server whose dispatcher has
  // not been installed yet.
  inventory: { kind: 'read', streams: false, timeoutMs: 20_000, needsInstance: false },
  // Reads apps.json and nothing else, so it runs unprivileged too.
  catalogue: { kind: 'read', streams: false, timeoutMs: 20_000, needsInstance: false },

  status: { kind: 'read', streams: false, timeoutMs: 30_000, needsInstance: false },
  versions: { kind: 'read', streams: false, timeoutMs: 60_000, needsInstance: true },
  // No limit: `stack logs` is `docker compose logs -f`, which never returns.
  // It ends when the viewer disconnects.
  logs: { kind: 'read', streams: true, timeoutMs: null, needsInstance: true },

  deploy: { kind: 'mutate', streams: true, timeoutMs: 15 * 60_000, needsInstance: true },
  rollback: { kind: 'mutate', streams: true, timeoutMs: 15 * 60_000, needsInstance: true },
  start: { kind: 'mutate', streams: true, timeoutMs: 15 * 60_000, needsInstance: true },
  stop: { kind: 'mutate', streams: true, timeoutMs: 5 * 60_000, needsInstance: true },
  // Streams whole volumes to remote storage; on a large instance this is hours.
  backup: { kind: 'mutate', streams: true, timeoutMs: 4 * 60 * 60_000, needsInstance: false },

  // Takes an instance out of service. Both run a full backup first and refuse
  // if it fails, so the timeout is the backup's, not a lifecycle command's.
  //
  // Two entries rather than one flag, for the reason `secrets`/`secretsSet` are
  // two: the allowlisted name is what is granted, and the audit row then reads
  // `stack retire` or `stack retire --with-data` without anything having to
  // parse arguments back out to tell which one happened.
  retire: { kind: 'mutate', streams: true, timeoutMs: 4 * 60 * 60_000, needsInstance: true },
  // Deletes the volumes, the database and the secrets. Nothing undoes this;
  // `retire` alone is undone with `stack add --reuse-secrets`.
  retireWithData: {
    kind: 'mutate',
    streams: true,
    timeoutMs: 4 * 60 * 60_000,
    needsInstance: true,
    subcommand: 'retire',
    label: 'retire --with-data',
  },

  // Which variables an instance declares and which are set. Never a value.
  secrets: {
    kind: 'read',
    streams: false,
    timeoutMs: 30_000,
    needsInstance: true,
    subcommand: 'secrets',
  },
  // The same subcommand, writing. `mutate`, so it takes the instance lock and
  // is recorded — the change itself travels on stdin, not in this argv.
  secretsSet: {
    kind: 'mutate',
    streams: false,
    timeoutMs: 30_000,
    needsInstance: true,
    subcommand: 'secrets',
  },
};

export interface CommandRequest {
  command: CommandName;
  /** Instance name, or the mode for `backup`. */
  argument?: string;
  /** `deploy` only. */
  version?: string;
  /** `versions` only: ask for the machine-readable form instead of the printed one. */
  json?: boolean;
}

/**
 * Builds the argv for a request.
 *
 * Returns an array, never a string, so nothing downstream has to quote or
 * escape — `ssh2`'s exec takes one line, and that line is assembled here from
 * values every one of which has been matched against a regex first.
 *
 * `stackPath` is checked rather than trusted: it reaches this point from the
 * database, and a row is not a safer source than a form.
 */
export function buildCommand(request: CommandRequest, stackPath: string): string[] {
  const spec = COMMANDS[request.command];
  if (!spec) throw new Error(`Unknown command '${request.command}'`);

  if (!SAFE_PATH.test(stackPath)) {
    throw new Error(`Refusing to build a command with stackPath '${stackPath}'`);
  }

  if (request.command === 'inventory' || request.command === 'catalogue') {
    return [stackPath, request.command];
  }

  const argv = ['sudo', '-n', '-u', OWNER, DISPATCHER, spec.subcommand ?? request.command];

  if (request.command === 'backup') {
    if (request.argument !== 'full' && request.argument !== 'incremental') {
      throw new Error("backup takes 'full' or 'incremental'");
    }
    return [...argv, request.argument];
  }

  if (spec.needsInstance || request.argument !== undefined) {
    const instance = request.argument ?? '';
    if (!SAFE_NAME.test(instance)) {
      throw new Error(`Refusing to build a command for instance '${instance}'`);
    }
    argv.push(instance);
  }

  // Fixed flags, chosen by which entry was asked for rather than passed in.
  // Nothing about the change being written appears here: it goes on stdin.
  if (request.command === 'secrets') return [...argv, '--json'];
  if (request.command === 'secretsSet') return [...argv, '--set'];
  if (request.command === 'retireWithData') return [...argv, '--with-data'];

  if (request.version !== undefined) {
    if (request.command !== 'deploy') {
      throw new Error(`'${request.command}' takes no version`);
    }
    if (!SAFE_NAME.test(request.version)) {
      throw new Error(`Refusing to build a command for version '${request.version}'`);
    }
    argv.push('--version', request.version);
  }

  if (request.json) {
    if (request.command !== 'versions') {
      throw new Error(`'${request.command}' has no JSON form`);
    }
    argv.push('--json');
  }

  return argv;
}

/**
 * The account the dispatcher runs `stack` as — the one that owns stack's
 * directory and is in the docker group. Fixed rather than configurable: it
 * has to match the sudo rule setup-server.sh wrote, and a mismatch should be
 * a failed command, not a silently different privilege.
 */
const OWNER = 'ubuntu';
