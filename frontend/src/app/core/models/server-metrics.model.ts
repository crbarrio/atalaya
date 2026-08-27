/** Mirrors the backend's `ServerMetrics` / `InstanceUsage` (backend/src/monitoring/interfaces). */
export interface ServerMetrics {
  cpu: { percent: number | null };
  memory: { usedBytes: number | null; totalBytes: number | null; daysRemaining: number | null };
  /** Every mounted filesystem, fullest first. */
  disks: DiskUsage[];
  /** Whether Prometheus itself can reach the collector — different from whether SSH can reach the server. */
  scrape: { node: boolean | null; cadvisor: boolean | null };
  uptime: { seconds: number | null };
  load: { load1: number | null; load5: number | null; cpuCount: number | null };
}

export interface DiskUsage {
  mountpoint: string;
  usedBytes: number | null;
  totalBytes: number | null;
  daysRemaining: number | null;
}

/** Which disk alerts are on for one mountpoint. Absent row means both on. */
export interface DiskAlertPreference {
  mountpoint: string;
  trendAlerts: boolean;
  capacityAlerts: boolean;
}

export interface InstanceUsage {
  name: string;
  memoryBytes: number;
  cpuCores: number;
  containers: number;
}

/** One container on a host server, named as docker names it. */
export interface HostContainer {
  name: string;
  memoryBytes: number;
  cpuCores: number;
}

/** traefik, mysql, postgres — shared per server, not tied to any instance. */
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

export interface ServerMetricsResponse {
  server: ServerMetrics;
  instances: InstanceUsage[];
  engine: EngineUsage[];
  backup: BackupDuration[];
  alerts: ActiveAlert[];
}
