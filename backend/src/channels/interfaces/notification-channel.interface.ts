/** One adapter per type in the notifier — see `notifier/`. */
export type ChannelType = 'email' | 'telegram';

export interface EmailChannelConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  to: string;
}

export interface TelegramChannelConfig {
  /** From @BotFather. */
  botToken: string;
  /** The chat (or channel) the bot posts to — a person's numeric id, or a group/channel id. */
  chatId: string;
}

/** What a channel's `config` column holds, keyed by `type`. */
export type ChannelConfig = EmailChannelConfig | TelegramChannelConfig;

/**
 * Never carries a secret — `password`, `botToken` and `chatId` stay
 * write-only. Everything else in `config` is safe to hand back so the edit
 * form can pre-fill it instead of asking someone to retype an SMTP host
 * they already got right.
 */
export interface NotificationChannelView {
  id: string;
  name: string;
  type: ChannelType;
  enabled: boolean;
  severities: string[];
  createdAt: Date;
  updatedAt: Date;
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  from?: string;
  to?: string;
}

export interface CreateNotificationChannelRequest {
  name: string;
  type: ChannelType;
  enabled: boolean;
  severities: string[];
  config: ChannelConfig;
}

export type UpdateNotificationChannelRequest = Partial<CreateNotificationChannelRequest>;
