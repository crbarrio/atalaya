import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_BASE } from '../http/api.config';
import { ProvisionCheck, RegisterServerRequest } from '../models/registration.model';
import { Server } from '../models/server.model';

@Injectable({ providedIn: 'root' })
export class RegistrationService {
  private readonly http = inject(HttpClient);

  register(request: RegisterServerRequest): Promise<Server> {
    return firstValueFrom(this.http.post<Server>(`${API_BASE}/servers`, request));
  }

  setupScriptUrl(name: string): string {
    return `${API_BASE}/servers/${name}/setup-script`;
  }

  verify(name: string): Promise<ProvisionCheck[]> {
    return firstValueFrom(this.http.post<ProvisionCheck[]>(`${API_BASE}/servers/${name}/verify`, {}));
  }

  deregister(name: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API_BASE}/servers/${name}`));
  }
}
