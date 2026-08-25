import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { ChannelConfig, ChannelType } from '../channels/interfaces/notification-channel.interface';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../shared/crypto/encryption.service';
import { EmailAdapter } from './adapters/email.adapter';
import { TelegramAdapter } from './adapters/telegram.adapter';
import { IncidentNotification, NotificationAdapter } from './interfaces/notification-adapter.interface';

/**
 * Fans one incident out to every enabled channel whose severities include
 * it. A failing channel never blocks another — one bad SMTP password should
 * not silently take the rest of the fleet's alerting down with it.
 */
@Injectable()
export class NotifierService {
  private readonly logger = new Logger(NotifierService.name);
  private readonly adapters: Record<string, NotificationAdapter>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    email: EmailAdapter,
    telegram: TelegramAdapter,
  ) {
    this.adapters = { email, telegram };
  }

  /**
   * Checked before a channel is ever written to the database, not from a
   * separate "test connection" button — a channel whose credentials do not
   * work should never exist in the table in the first place. Lets the real
   * failure through (a wrong SMTP password reads as itself, not as a generic
   * 400) rather than swallowing it the way `notify()` does for a channel
   * that already exists.
   */
  async verify(type: ChannelType, config: ChannelConfig): Promise<void> {
    const adapter = this.adapters[type];
    if (!adapter) throw new BadRequestException(`No adapter for channel type '${type}'`);

    try {
      await adapter.verify(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Could not connect: ${message}`);
    }
  }

  async notify(incident: IncidentNotification): Promise<void> {
    const channels = await this.prisma.notificationChannel.findMany({ where: { enabled: true } });
    const matching = channels.filter((channel) => channel.severities.split(',').includes(incident.severity));

    await Promise.all(matching.map((channel) => this.sendOne(channel, incident)));
  }

  private async sendOne(
    channel: { id: string; name: string; type: string; config: string },
    incident: IncidentNotification,
  ): Promise<void> {
    const adapter = this.adapters[channel.type];
    if (!adapter) {
      this.logger.warn(`Channel '${channel.name}': no adapter for type '${channel.type}'`);
      return;
    }

    try {
      const config = JSON.parse(this.encryption.decrypt(channel.config)) as ChannelConfig;
      await adapter.send(config, incident);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Could not notify '${channel.name}': ${message}`);
    }
  }
}
