export type ProvisionCheckName = 'node_exporter' | 'cadvisor' | 'prometheus_target';
export type ProvisionCheckResult = 'pass' | 'fail';

/** One traffic light. */
export interface ProvisionCheckView {
  check: ProvisionCheckName;
  result: ProvisionCheckResult;
  detail: string | null;
  checkedAt: Date;
}
