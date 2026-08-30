import { Component, inject, signal } from '@angular/core';
import { form, FormField, submit } from '@angular/forms/signals';

import { SettingsService } from '../../core/services/settings.service';
import { NotificationChannels } from './notification-channels/notification-channels';
import { errorMessage } from '../../shared/error-message';

@Component({
  selector: 'app-settings',
  imports: [FormField, NotificationChannels],
  templateUrl: './settings.html',
})
export class SettingsPage {
  private readonly settingsService = inject(SettingsService);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saved = signal(false);

  protected readonly model = signal({ healthchecksUrl: '' });
  protected readonly settingsForm = form(this.model);

  constructor() {
    this.load();
  }

  private async load(): Promise<void> {
    try {
      const settings = await this.settingsService.get();
      this.model.set({ healthchecksUrl: settings.healthchecksUrl ?? '' });
    } catch {
      this.loadError.set('Could not reach the API.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.saved.set(false);
    await submit(this.settingsForm, async () => {
      try {
        const url = this.model().healthchecksUrl.trim();
        await this.settingsService.update(url === '' ? null : url);
        this.saved.set(true);
        return undefined;
      } catch (error) {
        return [{ fieldTree: this.settingsForm.healthchecksUrl, kind: 'server', message: errorMessage(error) }];
      }
    });
  }
}
