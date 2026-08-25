/** Null wherever Prometheus had no series to answer with — not the same as zero. */
export interface ServerMetrics {
  cpu: { percent: number | null };
  /** `daysRemaining` is null when the trend is flat or growing, not shrinking. */
  memory: { usedBytes: number | null; totalBytes: number | null; daysRemaining: number | null };
  disk: {
    usedBytes: number | null;
    totalBytes: number | null;
    mountpoint: string;
    daysRemaining: number | null;
  };
  /** Null when Prometheus has no series for that target at all — never scraped, not just down. */
  scrape: { node: boolean | null; cadvisor: boolean | null };
  uptime: { seconds: number | null };
  /** 1-minute and 5-minute load average, alongside the core count needed to judge them. */
  load: { load1: number | null; load5: number | null; cpuCount: number | null };
}

/** One instance, summed across its containers. */
export interface InstanceUsage {
  name: string;
  memoryBytes: number;
  cpuCores: number;
  containers: number;
}

/** One container on a `host` server, named as docker names it. */
export interface HostContainer {
  name: string;
  memoryBytes: number;
  cpuCores: number;
}

/** One engine container — traefik, mysql, postgres, a DB manager. */
export interface EngineUsage {
  service: string;
  memoryBytes: number;
  cpuCores: number;
}

/** How long the last backup of this mode took — SSH reports status and timestamp, not duration. */
export interface BackupDuration {
  mode: string;
  seconds: number;
}

/** One alert Prometheus is currently evaluating as true for this server. */
export interface ActiveAlert {
  name: string;
  severity: string;
  state: 'pending' | 'firing';
  summary: string;
}

/** One sample on a chart: Unix seconds and the value at that point. */
export interface HistoryPoint {
  t: number;
  v: number;
}

/** CPU/memory/disk over a window — percent-used for all three, so one y-axis fits all. */
export interface ServerHistory {
  cpu: HistoryPoint[];
  memory: HistoryPoint[];
  disk: HistoryPoint[];
}

/** One version's run: `to` is null while it is still the deployed one. */
export interface DeployHistoryEntry {
  version: string;
  from: string;
  to: string | null;
}
