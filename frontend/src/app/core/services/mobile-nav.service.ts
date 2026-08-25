import { Injectable, signal } from '@angular/core';

/** Sidebar drawer open/closed state on narrow viewports — shared so the topbar's hamburger and the sidebar itself agree without an input/output chain through app-layout. */
@Injectable({ providedIn: 'root' })
export class MobileNavService {
  readonly open = signal(false);

  toggle(): void {
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
  }
}
