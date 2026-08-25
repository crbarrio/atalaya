/** Just the machine's tailnet name — the backend resolves everything else over MagicDNS. */
export interface RegisterServerRequest {
  name: string;
}

export type ProvisionCheckName = 'node_exporter' | 'cadvisor' | 'prometheus_target';
export type ProvisionCheckResult = 'pass' | 'fail';

/** Mirrors the backend's `ProvisionCheckView` (backend/src/registration/interfaces). */
export interface ProvisionCheck {
  check: ProvisionCheckName;
  result: ProvisionCheckResult;
  detail: string | null;
  checkedAt: string;
}
