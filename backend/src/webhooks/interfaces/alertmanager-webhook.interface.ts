/** The subset of Alertmanager's webhook payload atalaya reads. */
export interface AlertmanagerWebhookPayload {
  status: 'firing' | 'resolved';
  alerts: AlertmanagerAlert[];
}

export interface AlertmanagerAlert {
  status: 'firing' | 'resolved';
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: string;
  endsAt: string;
  /** Alertmanager's identity for this alert instance — stable across repeats, so upsert on it. */
  fingerprint: string;
}
