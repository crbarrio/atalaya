import { HttpClient, httpResource, HttpResourceRef } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_BASE } from '../http/api.config';
import { Incident, SilenceResult } from '../models/incident.model';
import { pollResource } from '../../shared/poll-resource';

@Injectable({ providedIn: 'root' })
export class IncidentsService {
  private readonly http = inject(HttpClient);

  private readonly incidentsResource = httpResource<Incident[]>(() => `${API_BASE}/incidents`, {
    defaultValue: [],
  });

  constructor() {
    pollResource(this.incidentsResource);
  }

  list(): HttpResourceRef<Incident[]> {
    return this.incidentsResource;
  }

  async silence(id: string, hours: number): Promise<SilenceResult> {
    const result = await firstValueFrom(
      this.http.post<SilenceResult>(`${API_BASE}/incidents/${id}/silence`, { hours }),
    );
    this.incidentsResource.reload();
    return result;
  }
}
