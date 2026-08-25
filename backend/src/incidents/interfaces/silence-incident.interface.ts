export interface SilenceIncidentRequest {
  /** How long Alertmanager should stop routing this alert for. */
  hours: number;
}

export interface SilenceIncidentResult {
  silenceId: string;
  endsAt: Date;
}
