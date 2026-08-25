/**
 * Mirrors the backend's `ServerView` (backend/src/servers/interfaces). Kept in
 * sync by hand rather than generated: the surface is small and a shared types
 * package would be more ceremony than the two files are worth.
 */
export interface Server {
  /** `stack` — instances and backups — or `host`, a machine with metrics only. */
  kind: string;
  name: string;
  host: string;
  tailnetIp: string;
  enabled: boolean;
  health: ServerHealth;
  lastSeenAt: string | null;
  lastError: string | null;
  /** False when the reading account cannot see docker: every instance state is 'unknown'. */
  containersObservable: boolean;
  backup: ServerBackup;
  counts: InstanceCounts;
}

export type ServerHealth = 'ok' | 'stale' | 'unreachable' | 'never read';

export interface ServerBackup {
  status: string | null;
  at: string | null;
  mode: string | null;
  detail: string | null;
}

export interface InstanceCounts {
  total: number;
  running: number;
  /** Not knowing is not the same as being down — counted apart on purpose. */
  unknown: number;
  down: number;
}
