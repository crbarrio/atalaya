import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_BASE } from '../http/api.config';
import { CreateInstanceRequest, InstancePlan } from '../models/instance-plan.model';

/**
 * Creating an instance. Two calls of the same command on the server: `preview`
 * writes nothing, `create` does it. Both answer with the same plan, so the
 * screen that asks for confirmation and the screen that reports the result show
 * the same fields.
 */
@Injectable({ providedIn: 'root' })
export class InstancesService {
  private readonly http = inject(HttpClient);

  preview(server: string, request: CreateInstanceRequest): Promise<InstancePlan> {
    return firstValueFrom(
      this.http.post<InstancePlan>(`${API_BASE}/instances/${server}/preview`, request),
    );
  }

  create(server: string, request: CreateInstanceRequest): Promise<InstancePlan> {
    return firstValueFrom(this.http.post<InstancePlan>(`${API_BASE}/instances/${server}`, request));
  }
}
