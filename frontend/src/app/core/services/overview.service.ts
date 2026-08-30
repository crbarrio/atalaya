import { httpResource, HttpResourceRef } from '@angular/common/http';
import { Injectable } from '@angular/core';

import { pollResource } from '../../shared/poll-resource';
import { API_BASE } from '../http/api.config';
import { OverviewData } from '../models/overview.model';

@Injectable({ providedIn: 'root' })
export class OverviewService {
  /** Polled: this is the screen someone leaves open to watch. */
  overview(): HttpResourceRef<OverviewData | undefined> {
    const resource = httpResource<OverviewData>(() => `${API_BASE}/overview`);
    pollResource(resource);
    return resource;
  }
}
