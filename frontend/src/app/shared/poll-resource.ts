import { DestroyRef, inject } from '@angular/core';

/** Prometheus itself scrapes every 30s — polling faster would ask for data that doesn't exist yet. */
const DEFAULT_POLL_MS = 30_000;

export function pollResource(resource: { reload: () => boolean }, intervalMs = DEFAULT_POLL_MS): void {
  const id = setInterval(() => resource.reload(), intervalMs);
  inject(DestroyRef).onDestroy(() => clearInterval(id));
}
