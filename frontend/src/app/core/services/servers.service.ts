import { HttpClient, httpResource, HttpResourceRef } from '@angular/common/http';
import { Injectable, Signal, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_BASE } from '../http/api.config';
import { ServerDetail } from '../models/instance.model';
import { Server } from '../models/server.model';
import { pollResource } from '../../shared/poll-resource';

/**
 * Two failure modes must not be conflated: an HTTP request that fails
 * outright (network down, backend not running) is a property of *this*
 * resource, shown as a loading/error state. A server that SSH cannot reach is
 * a property of *the data* — `health: 'unreachable'` in a 200 response —
 * styled by `StateBadge`, not by this service.
 */
@Injectable({ providedIn: 'root' })
export class ServersService {
  private readonly serversResource = httpResource<Server[]>(() => `${API_BASE}/servers`, {
    defaultValue: [],
  });

  constructor() {
    pollResource(this.serversResource);
  }

  list(): Signal<Server[]> {
    return this.serversResource.value;
  }

  readonly isLoading = this.serversResource.isLoading;
  readonly error = this.serversResource.error;

  /**
   * One server with its instances. A method rather than a field: each caller
   * (server-detail, instance-detail) needs its own resource tied to its own
   * route-param signal, re-fetching when the name changes — a single shared
   * resource could only ever hold one name at a time.
   */
  serverDetail(name: Signal<string>): HttpResourceRef<ServerDetail | undefined> {
    const resource = httpResource<ServerDetail>(() => `${API_BASE}/servers/${name()}`);
    pollResource(resource);
    return resource;
  }

  /**
   * Re-reads one server's inventory over SSH, rather than waiting for the
   * scheduled refresh. Needed after an action that adds or removes an
   * instance: the cached `Instance` rows would otherwise still list one that
   * no longer exists.
   */
  refresh(name: string): Promise<unknown> {
    return firstValueFrom(this.http.post(`${API_BASE}/servers/${name}/refresh`, {}));
  }

  private readonly http = inject(HttpClient);
}
