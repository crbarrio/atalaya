import { ServerHealth } from './interfaces/server-view.interface';

/** Older than this and the cache is shown as stale rather than current. */
const STALE_AFTER_MS = 15 * 60 * 1000;

/**
 * Four states, kept apart because they call for different reactions: never read
 * at all, read and now failing, read a while ago, and current.
 */
export function serverHealth(
  lastSeenAt: Date | null,
  lastError: string | null,
  now = Date.now(),
): ServerHealth {
  if (lastError) return 'unreachable';
  if (!lastSeenAt) return 'never read';
  return now - lastSeenAt.getTime() > STALE_AFTER_MS ? 'stale' : 'ok';
}

/**
 * A `host` server is never read over SSH, so the four states above have
 * nothing to work from. Prometheus answers the same question instead: `up` is
 * whether it reached the collector on its last scrape. No `stale` — Prometheus
 * either has a current answer or none at all.
 */
export function hostHealth(up: number | null): ServerHealth {
  if (up === null) return 'never read';
  return up === 1 ? 'ok' : 'unreachable';
}
