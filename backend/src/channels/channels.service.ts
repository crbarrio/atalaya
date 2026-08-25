import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotifierService } from '../notifier/notifier.service';
import { EncryptionService } from '../shared/crypto/encryption.service';
import { toChannelView } from './channels.mapper';
import {
  ChannelConfig,
  ChannelType,
  CreateNotificationChannelRequest,
  NotificationChannelView,
  UpdateNotificationChannelRequest,
} from './interfaces/notification-channel.interface';

/**
 * Everything about a channel except sending through it — that's the
 * notifier's job, kept apart so this module never needs to know what an SMTP
 * transport or a Telegram bot looks like. It is still asked to verify a
 * config before one is ever written, though: a channel whose credentials do
 * not work should not exist in the table in the first place.
 *
 * `config` is encrypted before it ever reaches the database — an SMTP
 * password or a bot token is a secret atalaya must hand back to a third
 * party later, not a login to verify, so this is AES-256-GCM (reversible),
 * not bcrypt/argon2 (one-way, and useless for a value the app needs back).
 */
@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly notifier: NotifierService,
  ) {}

  async findAll(): Promise<NotificationChannelView[]> {
    const rows = await this.prisma.notificationChannel.findMany({ orderBy: { name: 'asc' } });
    return rows.map((row) => toChannelView(row, this.decryptConfig(row.config)));
  }

  async create(request: CreateNotificationChannelRequest): Promise<NotificationChannelView> {
    const existing = await this.prisma.notificationChannel.findUnique({ where: { name: request.name } });
    if (existing) throw new ConflictException(`A channel named '${request.name}' already exists`);

    await this.notifier.verify(request.type, request.config);

    const row = await this.prisma.notificationChannel.create({
      data: {
        name: request.name,
        type: request.type,
        enabled: request.enabled,
        severities: request.severities.join(','),
        config: this.encryption.encrypt(JSON.stringify(request.config)),
      },
    });
    return toChannelView(row, request.config);
  }

  /**
   * A blank string in `request.config` means "leave this one alone" — the
   * edit form never gets the real secrets back to pre-fill, so the only way
   * to change just the recipient address without retyping the SMTP password
   * is for an empty field to mean "unchanged", merged against what is
   * already stored rather than overwriting it with an empty value.
   */
  async update(id: string, request: UpdateNotificationChannelRequest): Promise<NotificationChannelView> {
    const existing = await this.findOrThrow(id);

    let mergedConfig: ChannelConfig | undefined;
    if (request.config !== undefined) {
      const type = (request.type ?? existing.type) as ChannelType;
      const current = this.decryptConfig(existing.config) as unknown as Record<string, unknown>;
      const incoming = request.config as unknown as Record<string, unknown>;

      const merged: Record<string, unknown> = { ...current };
      for (const [key, value] of Object.entries(incoming)) {
        if (value === '') continue; // blank means "keep the existing value"
        merged[key] = value;
      }
      mergedConfig = merged as unknown as ChannelConfig;

      await this.notifier.verify(type, mergedConfig);
    }

    const row = await this.prisma.notificationChannel.update({
      where: { id },
      data: {
        ...(request.name !== undefined && { name: request.name }),
        ...(request.type !== undefined && { type: request.type }),
        ...(request.enabled !== undefined && { enabled: request.enabled }),
        ...(request.severities !== undefined && { severities: request.severities.join(',') }),
        ...(mergedConfig !== undefined && { config: this.encryption.encrypt(JSON.stringify(mergedConfig)) }),
      },
    });
    return toChannelView(row, mergedConfig ?? this.decryptConfig(existing.config));
  }

  async remove(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.prisma.notificationChannel.delete({ where: { id } });
  }

  private decryptConfig(encrypted: string): ChannelConfig {
    return JSON.parse(this.encryption.decrypt(encrypted)) as ChannelConfig;
  }

  private async findOrThrow(id: string) {
    const existing = await this.prisma.notificationChannel.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Unknown channel '${id}'`);
    return existing;
  }
}
