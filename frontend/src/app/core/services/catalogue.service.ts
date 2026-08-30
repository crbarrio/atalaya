import { httpResource, HttpResourceRef } from '@angular/common/http';
import { Injectable } from '@angular/core';

import { API_BASE } from '../http/api.config';
import { CatalogueResponse } from '../models/catalogue.model';

/** Not polled: apps.json changes when someone edits it, which is rarely. */
@Injectable({ providedIn: 'root' })
export class CatalogueService {
  catalogue(): HttpResourceRef<CatalogueResponse | undefined> {
    return httpResource<CatalogueResponse>(() => `${API_BASE}/catalogue`);
  }
}
