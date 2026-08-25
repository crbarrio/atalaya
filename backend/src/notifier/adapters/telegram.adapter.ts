import { Injectable } from '@nestjs/common';

import { TelegramChannelConfig } from '../../channels/interfaces/notification-channel.interface';
import { IncidentNotification, NotificationAdapter } from '../interfaces/notification-adapter.interface';

const API = 'https://api.telegram.org';
const TIMEOUT_MS = 10_000;

interface TelegramResponse {
  ok: boolean;
  description?: string;
}

@Injectable()
export class TelegramAdapter implements NotificationAdapter {
  async send(config: TelegramChannelConfig, incident: IncidentNotification): Promise<void> {
    const prefix = incident.status === 'resolved' ? '✅ RESOLVED: ' : '🔴 ';
    const where = incident.serverName ? ` — ${incident.serverName}` : '';
    const text =
      [`${prefix}${incident.alertName}${where}`, incident.summary, incident.description]
        .filter(Boolean)
        .join('\n\n') || incident.alertName;

    await this.call(config.botToken, 'sendMessage', { chat_id: config.chatId, text });
  }

  /**
   * `getChat` rather than `sendMessage`: it confirms both the token and that
   * the bot can actually see this chat, without posting anything visible —
   * a verification step that spams a real message is worse than no
   * verification at all.
   */
  async verify(config: TelegramChannelConfig): Promise<void> {
    await this.call(config.botToken, 'getChat', { chat_id: config.chatId });
  }

  private async call(botToken: string, method: string, params: Record<string, string>): Promise<void> {
    const response = await fetch(`${API}/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const body = (await response.json()) as TelegramResponse;
    if (!body.ok) {
      throw new Error(body.description ?? `Telegram '${method}' failed with no description`);
    }
  }
}
