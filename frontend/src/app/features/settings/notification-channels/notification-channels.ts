import { Dialog } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';

import { ChannelsService } from '../../../core/services/channels.service';
import { NotificationChannel } from '../../../core/models/channel.model';
import { ChannelFormDialog } from './channel-form-dialog/channel-form-dialog';

@Component({
  selector: 'app-notification-channels',
  templateUrl: './notification-channels.html',
})
export class NotificationChannels {
  private readonly channelsService = inject(ChannelsService);
  private readonly dialog = inject(Dialog);

  protected readonly channels = signal<NotificationChannel[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  protected readonly confirmingDeleteId = signal<string | null>(null);

  constructor() {
    this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.channels.set(await this.channelsService.list());
    } catch {
      this.loadError.set('Could not reach the API.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async toggleEnabled(channel: NotificationChannel): Promise<void> {
    await this.channelsService.update(channel.id, { enabled: !channel.enabled });
    await this.load();
  }

  protected startDelete(id: string): void {
    this.confirmingDeleteId.set(id);
  }

  protected cancelDelete(): void {
    this.confirmingDeleteId.set(null);
  }

  protected async confirmDelete(id: string): Promise<void> {
    await this.channelsService.remove(id);
    this.confirmingDeleteId.set(null);
    await this.load();
  }

  /** `channel` omitted opens the dialog in add mode; passed, it opens in edit mode for that row. */
  protected openForm(channel?: NotificationChannel): void {
    const dialogRef = this.dialog.open(ChannelFormDialog, { data: channel ?? null });
    dialogRef.componentInstance?.closed.subscribe(() => dialogRef.close());
    dialogRef.closed.subscribe(() => this.load());
  }
}
