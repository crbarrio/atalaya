/** One adapter per type in the notifier. */
export type ChannelType = 'email' | 'telegram';

/** Non-secret fields (`host`/`port`/`secure`/`user`/`from`/`to`) round-trip for edit pre-fill; `password`/`botToken`/`chatId` never do. */
export interface NotificationChannel {
  id: string;
  name: string;
  type: ChannelType;
  enabled: boolean;
  severities: string[];
  createdAt: string;
  updatedAt: string;
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  from?: string;
  to?: string;
}

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
  /** The chat (or channel) the bot posts to. */
  chatId: string;
}

export type ChannelConfig = EmailChannelConfig | TelegramChannelConfig;

export interface CreateChannelRequest {
  name: string;
  type: ChannelType;
  enabled: boolean;
  severities: string[];
  config: ChannelConfig;
}

export type UpdateChannelRequest = Partial<CreateChannelRequest>;
