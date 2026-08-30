/** What the Overview screen needs, assembled in one request. */
export interface OverviewView {
  counts: { servers: number; instances: number; attention: number };
  /** Everything asking to be looked at, most severe first. */
  attention: AttentionItem[];
  /** The last actions anyone ran, newest first. */
  recent: RecentAction[];
}

export interface AttentionItem {
  /** `incident` | `unreachable` | `backup` — enough to pick an icon and a link. */
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
