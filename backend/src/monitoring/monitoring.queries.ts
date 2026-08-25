/**
 * Every PromQL string the backend runs, named and in one place — PLAN.md
 * asks for a catalogue rather than loose queries reaching the frontend.
 * `instance` is always `<tailnetIp>:<port>`, matching the `instance` label
 * Prometheus attaches from `targets/*.json`.
 */

export const nodeCpuPercent = (instance: string): string =>
  `100 * (1 - avg(rate(node_cpu_seconds_total{mode="idle",instance="${instance}"}[5m])))`;

export const nodeMemoryAvailableBytes = (instance: string): string =>
  `node_memory_MemAvailable_bytes{instance="${instance}"}`;

export const nodeMemoryTotalBytes = (instance: string): string =>
  `node_memory_MemTotal_bytes{instance="${instance}"}`;

/** Root filesystem only: every server in the fleet has a single disk. */
export const nodeDiskAvailableBytes = (instance: string): string =>
  `node_filesystem_avail_bytes{instance="${instance}",mountpoint="/",fstype!~"tmpfs|overlay|squashfs|ramfs"}`;

export const nodeDiskTotalBytes = (instance: string): string =>
  `node_filesystem_size_bytes{instance="${instance}",mountpoint="/",fstype!~"tmpfs|overlay|squashfs|ramfs"}`;

/**
 * Bytes/second, over the same 6 h window `infra/prometheus/rules/capacity.yml`
 * uses for `predict_linear` — same regression, so "days remaining" here means
 * the same thing as the alert that would fire on it. Negative means shrinking.
 */
export const nodeDiskAvailDeriv = (instance: string): string =>
  `deriv(node_filesystem_avail_bytes{instance="${instance}",mountpoint="/",fstype!~"tmpfs|overlay|squashfs|ramfs"}[6h])`;

export const nodeMemoryAvailDeriv = (instance: string): string =>
  `deriv(node_memory_MemAvailable_bytes{instance="${instance}"}[6h])`;

export const nodeBootTimeSeconds = (instance: string): string =>
  `node_boot_time_seconds{instance="${instance}"}`;

export const nodeLoad1 = (instance: string): string => `node_load1{instance="${instance}"}`;

export const nodeLoad5 = (instance: string): string => `node_load5{instance="${instance}"}`;

/** Same `mode="idle"` series `nodeCpuPercent` averages over — one row per core. */
export const nodeCpuCount = (instance: string): string =>
  `count(node_cpu_seconds_total{mode="idle",instance="${instance}"})`;

/**
 * Whether Prometheus itself can reach the collector — a different question
 * from whether SSH can reach the server. `instance` alone identifies the
 * series without a `job` filter: one job scrapes each port.
 */
export const targetUp = (instance: string): string => `up{instance="${instance}"}`;

/**
 * `backup.sh` writes this per mode (full/incremental) to node_exporter's
 * textfile directory — see stack-integration.md. SSH already reports
 * status/timestamp from `stack inventory`; duration only lives here.
 */
export const backupDurationSeconds = (instance: string): string =>
  `stack_backup_duration_seconds{instance="${instance}"}`;

/**
 * Raw, one row per container — not aggregated by any label. `stack.client` is
 * the only container label cAdvisor keeps, and it names who an instance
 * belongs to, not the instance itself; two instances can share it
 * (`acme` and `acme-test` both belong to client `acme`). The
 * container `name` label is what actually identifies the instance, via
 * `instanceOfContainer`.
 */
export const containerMemoryBytes = (instance: string): string =>
  `container_memory_usage_bytes{instance="${instance}"}`;

/** Fractional CPU cores, averaged over 5 m — cAdvisor sums all cores into one series per container. */
export const containerCpuCores = (instance: string): string =>
  `rate(container_cpu_usage_seconds_total{instance="${instance}"}[5m])`;

/**
 * Percent-used forms of memory and disk, computed in PromQL rather than
 * ratio'd client-side from two series — a history chart wants one line, not
 * two series to zip together by timestamp afterward.
 */
export const nodeMemoryUsedPercent = (instance: string): string =>
  `100 * (1 - node_memory_MemAvailable_bytes{instance="${instance}"} / node_memory_MemTotal_bytes{instance="${instance}"})`;

export const nodeDiskUsedPercent = (instance: string): string =>
  `100 * (1 - node_filesystem_avail_bytes{instance="${instance}",mountpoint="/",fstype!~"tmpfs|overlay|squashfs|ramfs"} / node_filesystem_size_bytes{instance="${instance}",mountpoint="/",fstype!~"tmpfs|overlay|squashfs|ramfs"})`;

/**
 * Written by `stack`'s `write_deploy_metric()` (see monitoring.md), one
 * `.prom` file per instance, overwritten on every deploy — so each distinct
 * `version` label is its own Prometheus series, live only for the window
 * that version was actually deployed. Ranged over a long window, the set of
 * series *is* the deploy history: no separate event log needed.
 */
export const deployInfo = (instance: string, app: string): string =>
  `stack_deploy_info{instance="${instance}",app="${app}"}`;
