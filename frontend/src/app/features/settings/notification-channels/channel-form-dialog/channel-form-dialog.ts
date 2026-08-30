import { DIALOG_DATA } from '@angular/cdk/dialog';
import { Component, inject, output, signal } from '@angular/core';
import { FieldTree, form, FormField, required, submit } from '@angular/forms/signals';

import { ChannelsService } from '../../../../core/services/channels.service';
import { ChannelType, CreateChannelRequest, NotificationChannel } from '../../../../core/models/channel.model';
import { errorMessage } from '../../../../shared/error-message';

interface ChannelFormModel {
  name: string;
  type: ChannelType;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  to: string;
  botToken: string;
  chatId: string;
  critical: boolean;
  warning: boolean;
}

const EMPTY_MODEL: ChannelFormModel = {
  name: '',
  type: 'email',
  host: '',
  port: 465,
  secure: true,
  user: '',
  password: '',
  from: '',
  to: '',
  botToken: '',
  chatId: '',
  critical: true,
  warning: true,
};

@Component({
  selector: 'app-channel-form-dialog',
  imports: [FormField],
  templateUrl: './channel-form-dialog.html',
})
export class ChannelFormDialog {
  private readonly channelsService = inject(ChannelsService);
  /** The row's own channel when opened via "Edit"; `null` opens it in add mode. */
  protected readonly editing = inject<NotificationChannel | null>(DIALOG_DATA);

  readonly closed = output<void>();

  protected readonly model = signal<ChannelFormModel>(
    this.editing
      ? {
          ...EMPTY_MODEL,
          name: this.editing.name,
          type: this.editing.type,
          // Non-secret config round-trips from GET /channels — pre-filled.
          // password/botToken/chatId never do, and stay blank on purpose:
          // submitting blank means "leave the stored value alone".
          host: this.editing.host ?? '',
          port: this.editing.port ?? EMPTY_MODEL.port,
          secure: this.editing.secure ?? EMPTY_MODEL.secure,
          user: this.editing.user ?? '',
          from: this.editing.from ?? '',
          to: this.editing.to ?? '',
          critical: this.editing.severities.includes('critical'),
          warning: this.editing.severities.includes('warning'),
        }
      : { ...EMPTY_MODEL },
  );

  // Type-specific fields are validated by hand in onSubmit — required() has
  // no clean way to switch which path it targets when `type` changes.
  protected readonly channelForm = form(this.model, (path) => {
    required(path.name, { message: 'Name is required' });
  });

  protected setType(type: ChannelType): void {
    if (this.editing) return; // fixed once a channel exists — see the template
    this.model.update((m) => ({ ...m, type }));
  }

  protected onCancel(): void {
    this.closed.emit();
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.channelForm, async () => {
      const m = this.model();
      const missing = this.missingFields(m);
      if (missing.length > 0) return missing;

      const severities = [m.critical && 'critical', m.warning && 'warning'].filter(Boolean) as string[];
      const request: CreateChannelRequest = {
        name: m.name.trim(),
        type: m.type,
        enabled: true,
        severities,
        config:
          m.type === 'email'
            ? {
                host: m.host.trim(),
                port: m.port,
                secure: m.secure,
                user: m.user.trim(),
                password: m.password,
                from: m.from.trim(),
                to: m.to.trim(),
              }
            : { botToken: m.botToken.trim(), chatId: m.chatId.trim() },
      };

      try {
        if (this.editing) {
          await this.channelsService.update(this.editing.id, request);
        } else {
          await this.channelsService.create(request);
        }
        this.closed.emit();
        return undefined;
      } catch (error) {
        return [{ fieldTree: this.channelForm.name, kind: 'server', message: errorMessage(error) }];
      }
    });
  }

  private missingFields(m: ChannelFormModel): { fieldTree: FieldTree<string>; kind: string; message: string }[] {
    // Secrets are optional while editing — blank means "keep the stored
    // value" (see the model comment above). Only required for a brand new
    // channel, which has no stored value to fall back on.
    const secretRequired = !this.editing;

    const requiredFields: [boolean, FieldTree<string>, string][] =
      m.type === 'email'
        ? [
            [!m.host.trim(), this.channelForm.host, 'Host is required'],
            [!m.user.trim(), this.channelForm.user, 'User is required'],
            [secretRequired && !m.password.trim(), this.channelForm.password, 'Password is required'],
            [!m.from.trim(), this.channelForm.from, 'From address is required'],
            [!m.to.trim(), this.channelForm.to, 'Recipient is required'],
          ]
        : [
            [secretRequired && !m.botToken.trim(), this.channelForm.botToken, 'Bot token is required'],
            [secretRequired && !m.chatId.trim(), this.channelForm.chatId, 'Chat id is required'],
          ];

    return requiredFields
      .filter(([isMissing]) => isMissing)
      .map(([, fieldTree, message]) => ({ fieldTree, kind: 'server', message }));
  }
}
