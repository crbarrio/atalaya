import { Resource } from '@angular/core';

/**
 * A resource's value, or a fallback when it failed.
 *
 * Reading `.value()` on an errored `httpResource` throws, and a throw during
 * change detection takes the whole view down with it — one dead endpoint blanks
 * a page that could have shown everything else. Found when Prometheus was
 * unreachable and the deploy-history request 500'd: the instance page stopped
 * rendering entirely, actions and all.
 */
export function valueOr<T>(resource: Resource<T | undefined>, fallback: T): T {
  return resource.hasValue() ? (resource.value() as T) : fallback;
}
