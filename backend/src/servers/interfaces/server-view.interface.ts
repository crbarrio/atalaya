/** One card in the overview. Never the raw row: sshKeyPath stays server-side. */
export interface ServerView {
  /** `stack` (SSH inventory, instances, backups) or `host` (metrics only). */
  kind: string;
  name: string;
  host: string;
  tailnetIp: string;
  enabled: boolean;
  health: ServerHealth;
  lastSeenAt: Date | null;
  lastError: string | null;
  /** False when the reading account cannot see docker, so state is unknown. */
  containersObservable: boolean;
  backup: ServerBackupView;
  counts: InstanceCounts;
}

export type ServerHealth = 'ok' | 'stale' | 'unreachable' | 'never read';

export interface ServerBackupView {
  status: string | null;
  at: string | null;
  mode: string | null;
  detail: string | null;
}

export interface InstanceCounts {
  total: number;
  running: number;
  /** Counted apart from `down`: not knowing is not the same as being down. */
  unknown: number;
  down: number;
}
