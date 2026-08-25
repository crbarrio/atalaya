import { ChannelConfig, ChannelType, NotificationChannelView } from './interfaces/notification-channel.interface';

interface NotificationChannelRow {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  severities: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `config` never comes in as the encrypted column — the caller decrypts it
 * first, because whether that is worth doing (and for which channel) is a
 * decision this mapper has no business making. Only the non-secret half of
 * it is ever put on the view; `password`/`botToken`/`chatId` are left out by
 * simply never being read off `config` here.
 */
export function toChannelView(row: NotificationChannelRow, config: ChannelConfig): NotificationChannelView {
  const view: NotificationChannelView = {
    id: row.id,
    name: row.name,
    type: row.type as ChannelType,
    enabled: row.enabled,
    severities: row.severities.split(','),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  if (row.type === 'email' && 'host' in config) {
    view.host = config.host;
    view.port = config.port;
    view.secure = config.secure;
    view.user = config.user;
    view.from = config.from;
    view.to = config.to;
  }

  return view;
}
