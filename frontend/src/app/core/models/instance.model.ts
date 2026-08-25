/** Mirrors the backend's `InstanceView`. */
export interface Instance {
  name: string;
  app: string | null;
  client: string | null;
  enabled: boolean;
  version: string | null;
  deployedAt: string | null;
  previousVersion: string | null;
  previousAt: string | null;
  /**
   * running | stopped | not deployed | unknown | disabled…
   * `unknown` is what SSH reports whenever the account cannot see docker,
   * which is the normal case in production. It must never be styled as an
   * outage: liveness is Prometheus's question to answer, not this one's.
   */
  state: string | null;
  containers: { name: string; state: string }[] | null;
  /** Null when no backup has run yet for this instance, not an empty list. */
  volumes: { name: string; sizeBytes: number }[] | null;
  database: { engine: string | null; name: string | null } | null;
  domains: string[];
  fetchedAt: string;
}

/** `Server` plus its instances listed rather than only counted. */
export interface ServerDetail {
  /** `stack` — instances and backups — or `host`, a machine with metrics only. */
  kind: string;
  name: string;
  host: string;
  tailnetIp: string;
  enabled: boolean;
  health: string;
  lastSeenAt: string | null;
  lastError: string | null;
  containersObservable: boolean;
  backup: { status: string | null; at: string | null; mode: string | null; detail: string | null };
  counts: { total: number; running: number; unknown: number; down: number };
  instances: Instance[];
}
