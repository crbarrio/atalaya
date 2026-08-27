import { HttpClient, httpResource, HttpResourceRef } from '@angular/common/http';
import { Injectable, Signal, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_BASE } from '../http/api.config';
import { DeployHistoryEntry, ServerHistory } from '../models/history.model';
import {
  DiskAlertPreference,
  HostContainer,
  ServerMetricsResponse,
} from '../models/server-metrics.model';
import { pollResource } from '../../shared/poll-resource';

@Injectable({ providedIn: 'root' })
export class MetricsService {
  private readonly http = inject(HttpClient);

  serverMetrics(name: Signal<string>): HttpResourceRef<ServerMetricsResponse | undefined> {
    const resource = httpResource<ServerMetricsResponse>(() => `${API_BASE}/monitoring/${name()}/metrics`);
    pollResource(resource);
    return resource;
  }

  diskPreferences(name: Signal<string>): HttpResourceRef<DiskAlertPreference[]> {
    return httpResource<DiskAlertPreference[]>(
      () => `${API_BASE}/monitoring/${name()}/disks/preferences`,
      { defaultValue: [] },
    );
  }

  async updateDiskPreference(
    name: string,
    mountpoint: string,
    changes: { trendAlerts?: boolean; capacityAlerts?: boolean },
  ): Promise<void> {
    await firstValueFrom(
      this.http.put(`${API_BASE}/monitoring/${name}/disks/preferences`, { mountpoint, ...changes }),
    );
  }

  hostContainers(name: Signal<string>): HttpResourceRef<HostContainer[]> {
    const resource = httpResource<HostContainer[]>(
      () => `${API_BASE}/monitoring/${name()}/containers`,
      { defaultValue: [] },
    );
    pollResource(resource);
    return resource;
  }

  /** Not polled — a chart the visitor is actively looking at re-fetches when they change the range, not every 30s. */
  history(name: Signal<string>, hours: Signal<number>): HttpResourceRef<ServerHistory | undefined> {
    return httpResource<ServerHistory>(() => `${API_BASE}/monitoring/${name()}/history?hours=${hours()}`);
  }

  deployHistory(
    name: Signal<string>,
    instance: Signal<string>,
    days: Signal<number>,
  ): HttpResourceRef<DeployHistoryEntry[]> {
    return httpResource<DeployHistoryEntry[]>(
      () => `${API_BASE}/monitoring/${name()}/${instance()}/deploys?days=${days()}`,
      { defaultValue: [] },
    );
  }
}
