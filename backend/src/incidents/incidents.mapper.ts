import { IncidentView } from './interfaces/incident-view.interface';
import { parseLabels } from './parse-labels';

interface IncidentRow {
  id: string;
  server: { name: string } | null;
  alertName: string;
  severity: string;
  status: string;
  summary: string | null;
  description: string | null;
  labels: string | null;
  startsAt: Date;
  endsAt: Date | null;
  receivedAt: Date;
}

export function toIncidentView(row: IncidentRow): IncidentView {
  return {
    id: row.id,
    server: row.server?.name ?? null,
    alertName: row.alertName,
    severity: row.severity,
    status: row.status,
    summary: row.summary,
    description: row.description,
    labels: parseLabels(row.labels),
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    receivedAt: row.receivedAt,
  };
}
