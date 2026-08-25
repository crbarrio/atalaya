/** One row of the incident inbox, as the API returns it. */
export interface IncidentView {
  id: string;
  server: string | null;
  alertName: string;
  severity: string;
  /** firing | resolved — set by Alertmanager, not by anyone reading the inbox. */
  status: string;
  summary: string | null;
  description: string | null;
  labels: Record<string, string>;
  startsAt: Date;
  endsAt: Date | null;
  receivedAt: Date;
}
