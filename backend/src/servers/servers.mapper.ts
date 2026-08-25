import { StackContainer, VolumeSummary } from '../inventory/interfaces/stack-inventory.interface';
import { InstanceView } from './interfaces/instance-view.interface';
import { InstanceCounts, ServerHealth, ServerView } from './interfaces/server-view.interface';
import { serverHealth } from './server-health';

/** The database rows this mapper reads, and nothing more. */
interface ServerRow {
  kind: string;
  name: string;
  host: string;
  tailnetIp: string;
  enabled: boolean;
  lastSeenAt: Date | null;
  lastError: string | null;
  containersObservable: boolean;
  lastBackupStatus: string | null;
  lastBackupAt: string | null;
  lastBackupMode: string | null;
  lastBackupDetail: string | null;
}

interface InstanceRow {
  name: string;
  app: string | null;
  client: string | null;
  enabled: boolean;
  version: string | null;
  deployedAt: Date | null;
  previousVersion: string | null;
  previousAt: Date | null;
  state: string | null;
  containers: string | null;
  volumes: string | null;
  databaseEngine: string | null;
  databaseName: string | null;
  domains: string | null;
  fetchedAt: Date;
}

/**
 * `health` is passed in rather than derived here for `host` servers: theirs
 * comes from Prometheus, which is an async call this mapper has no business
 * making. Omitted, it falls back to the SSH-derived answer.
 */
export function toServerView(
  server: ServerRow,
  instances: { state: string | null }[],
  health?: ServerHealth,
): ServerView {
  return {
    kind: server.kind,
    name: server.name,
    host: server.host,
    tailnetIp: server.tailnetIp,
    enabled: server.enabled,
    health: health ?? serverHealth(server.lastSeenAt, server.lastError),
    lastSeenAt: server.lastSeenAt,
    lastError: server.lastError,
    containersObservable: server.containersObservable,
    backup: {
      status: server.lastBackupStatus,
      at: server.lastBackupAt,
      mode: server.lastBackupMode,
      detail: server.lastBackupDetail,
    },
    counts: countStates(instances),
  };
}

export function toInstanceView(instance: InstanceRow): InstanceView {
  return {
    name: instance.name,
    app: instance.app,
    client: instance.client,
    enabled: instance.enabled,
    version: instance.version,
    deployedAt: instance.deployedAt,
    previousVersion: instance.previousVersion,
    previousAt: instance.previousAt,
    state: instance.state,
    containers: parseJson<StackContainer[]>(instance.containers),
    volumes: parseJson<VolumeSummary[]>(instance.volumes),
    database:
      instance.databaseEngine || instance.databaseName
        ? { engine: instance.databaseEngine, name: instance.databaseName }
        : null,
    domains: parseJson<string[]>(instance.domains) ?? [],
    fetchedAt: instance.fetchedAt,
  };
}

function countStates(instances: { state: string | null }[]): InstanceCounts {
  const states = instances.map((i) => i.state ?? 'unknown');
  return {
    total: states.length,
    running: states.filter((s) => s === 'running').length,
    // Apart from `down` on purpose: over SSH the account cannot see docker, so
    // `unknown` is the normal answer and calling it down would invent an
    // outage. Liveness comes from Prometheus.
    unknown: states.filter((s) => s === 'unknown').length,
    down: states.filter((s) => s === 'stopped' || s === 'not deployed').length,
  };
}

/** SQLite has no arrays, so lists travel as JSON text. Bad JSON is not fatal. */
function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
