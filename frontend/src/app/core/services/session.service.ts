import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';

import { API_BASE } from '../http/api.config';
import { Session } from '../models/session.model';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);

  readonly session = signal<Session | null>(null);
  readonly loaded = signal(false);

  load(): void {
    this.http.get<Session>(`${API_BASE}/me`).subscribe({
      next: (session) => {
        this.session.set(session);
        this.loaded.set(true);
      },
      error: () => {
        this.session.set(null);
        this.loaded.set(true);
      },
    });
  }
}
