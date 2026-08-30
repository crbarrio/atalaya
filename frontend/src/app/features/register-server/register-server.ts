import { Component, inject, output, signal } from '@angular/core';
import { form, FormField, required, submit } from '@angular/forms/signals';

import { ProvisionCheck } from '../../core/models/registration.model';
import { Server } from '../../core/models/server.model';
import { RegistrationService } from '../../core/services/registration.service';
import { errorMessage } from '../../shared/error-message';

@Component({
  selector: 'app-register-server',
  imports: [FormField],
  templateUrl: './register-server.html',
})
export class RegisterServer {
  private readonly registrationService = inject(RegistrationService);

  readonly closed = output<void>();

  protected readonly model = signal({ name: '' });
  protected readonly registerForm = form(this.model, (path) => {
    required(path.name, { message: 'The machine name is required' });
  });

  protected readonly registered = signal<Server | null>(null);

  protected readonly verifying = signal(false);
  protected readonly checks = signal<ProvisionCheck[] | null>(null);

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.registerForm, async () => {
      try {
        const server = await this.registrationService.register({ name: this.model().name.trim() });
        this.registered.set(server);
        return undefined;
      } catch (error) {
        // Lands on the field as a server error, cleared on the next edit.
        return [{ fieldTree: this.registerForm.name, kind: 'server', message: errorMessage(error) }];
      }
    });
  }

  protected setupScriptUrl(): string {
    return this.registrationService.setupScriptUrl(this.registered()!.name);
  }

  protected async verify(): Promise<void> {
    this.verifying.set(true);
    try {
      this.checks.set(await this.registrationService.verify(this.registered()!.name));
    } finally {
      this.verifying.set(false);
    }
  }

  onClose() {
    this.closed.emit();
  }
}
