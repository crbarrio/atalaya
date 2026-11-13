import { Injectable } from '@nestjs/common';

const DEFAULT_TIMEOUT_MS = 10_000;

export interface SilenceMatcher {
  name: string;
  value: string;
  isRegex: boolean;
}

export interface CreateSilence {
  matchers: SilenceMatcher[];
  startsAt: string;
  endsAt: string;
  createdBy: string;
  comment: string;
}

/** The subset of `GET /api/v2/alerts` atalaya reads. */
export interface ActiveAlert {
  fingerprint: string;
  labels: Record<string, string>;
}

/**
 * Thin client for Alertmanager's HTTP API. Only what atalaya needs: creating
 * silences, and reading what is active to reconcile incidents against.
 */
@Injectable()
export class AlertmanagerService {
  private readonly baseUrl = process.env.ALERTMANAGER_URL ?? 'http://127.0.0.1:9093';

  /**
   * Every alert Alertmanager holds as active, silenced and inhibited included:
   * a silence stops the routing, not the condition. Resolved alerts are not
   * returned, which is the point.
   */
  async getAlerts(): Promise<ActiveAlert[]> {
    return this.get<ActiveAlert[]>('/api/v2/alerts');
  }

  /** When this Alertmanager process started. It keeps no alerts across a restart. */
  async getStartedAt(): Promise<Date> {
    const status = await this.get<{ uptime: string }>('/api/v2/status');
    return new Date(status.uptime);
  }

  private async get<T>(path: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Alertmanager at ${this.baseUrl} did not answer: ${message}`);
    }
    if (!response.ok) {
      throw new Error(`Alertmanager returned HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  }

  async createSilence(silence: CreateSilence): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/v2/silences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(silence),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Alertmanager at ${this.baseUrl} did not answer: ${message}`);
    }
    if (!response.ok) {
      throw new Error(`Alertmanager returned HTTP ${response.status}`);
    }

    const body = (await response.json()) as { silenceID: string };
    return body.silenceID;
  }
}
