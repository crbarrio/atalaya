import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_BASE } from '../http/api.config';
import { Settings } from '../models/settings.model';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);

  get(): Promise<Settings> {
    return firstValueFrom(this.http.get<Settings>(`${API_BASE}/settings`));
  }

  update(healthchecksUrl: string | null): Promise<Settings> {
    return firstValueFrom(this.http.put<Settings>(`${API_BASE}/settings`, { healthchecksUrl }));
  }
}
