/** What every channel type needs to render a message, regardless of transport. */
export interface IncidentNotification {
  alertName: string;
  severity: string;
  summary: string | null;
  description: string | null;
  serverName: string | null;
  status: 'firing' | 'resolved';
}

/** One per channel type. `config` is that channel's own parsed JSON. */
export interface NotificationAdapter {
  send(config: unknown, incident: IncidentNotification): Promise<void>;
  /** Checks the credentials actually work, without sending anything. Throws with a human-readable reason on failure. */
  verify(config: unknown): Promise<void>;
}
