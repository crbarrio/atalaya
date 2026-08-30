/** Mirrors the backend's `OverviewView`. */
export interface OverviewData {
  counts: { servers: number; instances: number; attention: number };
  attention: AttentionItem[];
  recent: RecentAction[];
}

export interface AttentionItem {
  kind: string;
  severity: 'critical' | 'warning';
  summary: string;
  server: string | null;
  at: string | null;
}

export interface RecentAction {
  actor: string;
  action: string;
  target: string | null;
  succeeded: boolean;
  at: string;
}
