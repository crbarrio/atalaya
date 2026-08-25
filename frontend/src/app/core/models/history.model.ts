export interface HistoryPoint {
  t: number;
  v: number;
}

/** CPU/memory/disk, percent-used, over a window. */
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
