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

/** Thin client for Alertmanager's HTTP API. Only what atalaya needs: creating silences. */
@Injectable()
export class AlertmanagerService {
  private readonly baseUrl = process.env.ALERTMANAGER_URL ?? 'http://127.0.0.1:9093';

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
