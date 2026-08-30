import { HttpClient, httpResource, HttpResourceRef } from '@angular/common/http';
import { Injectable, Signal, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_BASE } from '../http/api.config';
import { VariablesChange, VariablesReport, VariablesWriteResult } from '../models/variables.model';

/**
 * An instance's variables.
 *
 * Read and write are asymmetric on purpose: the report comes back and can be
 * held in a signal, while a value goes out and is never returned. Nothing in
 * this service caches what was sent.
 */
@Injectable({ providedIn: 'root' })
export class VariablesService {
  private readonly http = inject(HttpClient);

  report(
    server: Signal<string>,
    instance: Signal<string>,
  ): HttpResourceRef<VariablesReport | undefined> {
    return httpResource<VariablesReport>(() => `${API_BASE}/variables/${server()}/${instance()}`);
  }

  write(server: string, instance: string, change: VariablesChange): Promise<VariablesWriteResult> {
    return firstValueFrom(
      this.http.put<VariablesWriteResult>(`${API_BASE}/variables/${server}/${instance}`, change),
    );
  }
}
