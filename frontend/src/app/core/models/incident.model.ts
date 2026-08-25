/** Mirrors the backend's `IncidentView` (backend/src/incidents/interfaces). */
export interface Incident {
  id: string;
  server: string | null;
  alertName: string;
  severity: string;
  /** firing | resolved — set by Alertmanager, not by anyone reading the inbox. */
  status: string;
  summary: string | null;
  description: string | null;
  labels: Record<string, string>;
  startsAt: string;
  endsAt: string | null;
  receivedAt: string;
}

export interface SilenceResult {
  silenceId: string;
  endsAt: string;
}
