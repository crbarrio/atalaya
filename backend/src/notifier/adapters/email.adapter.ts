import { Injectable } from '@nestjs/common';
import { Transporter, createTransport } from 'nodemailer';

import { EmailChannelConfig } from '../../channels/interfaces/notification-channel.interface';
import { IncidentNotification, NotificationAdapter } from '../interfaces/notification-adapter.interface';

/**
 * A transport per send, built from the channel's own config — there is no
 * shared SMTP setup to hold as connection state, and a channel can be edited
 * or disabled between two incidents.
 */
@Injectable()
export class EmailAdapter implements NotificationAdapter {
  async send(config: EmailChannelConfig, incident: IncidentNotification): Promise<void> {
    const transporter = this.transport(config);

    const prefix = incident.status === 'resolved' ? 'RESOLVED: ' : '';
    const where = incident.serverName ? ` — ${incident.serverName}` : '';
    const subject = `[atalaya] ${prefix}${incident.alertName}${where}`;
    const body = [incident.summary, incident.description].filter(Boolean).join('\n\n') || incident.alertName;

    await transporter.sendMail({ from: config.from, to: config.to, subject, text: body });
  }

  /** Opens the connection and authenticates, same as a real send, but sends nothing. */
  async verify(config: EmailChannelConfig): Promise<void> {
    await this.transport(config).verify();
  }

  private transport(config: EmailChannelConfig): Transporter {
    return createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
    });
  }
}
