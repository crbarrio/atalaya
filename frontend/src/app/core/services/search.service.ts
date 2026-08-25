import { Injectable, Signal } from '@angular/core';
import { httpResource, HttpResourceRef } from '@angular/common/http';

import { API_BASE } from '../http/api.config';
import { SearchResults } from '../models/search.model';

const EMPTY: SearchResults = { servers: [], instances: [] };

@Injectable({ providedIn: 'root' })
export class SearchService {
  /** No `q()` request at all while the box is empty — not a fetch for a result the backend would answer with nothing anyway. */
  search(query: Signal<string>): HttpResourceRef<SearchResults> {
    return httpResource<SearchResults>(
      () => {
        const q = query().trim();
        return q ? `${API_BASE}/search?q=${encodeURIComponent(q)}` : undefined;
      },
      { defaultValue: EMPTY },
    );
  }
}
