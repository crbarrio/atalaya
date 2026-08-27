import { Injectable } from '@nestjs/common';

import { engineServiceOfContainer, instanceOfContainer } from './container-name';
import {
  ActiveAlert,
  BackupDuration,
  DeployHistoryEntry,
  EngineUsage,
  HostContainer,
  InstanceUsage,
  ServerHistory,
} from './interfaces/server-metrics.interface';
import * as queries from './monitoring.queries';
import { PrometheusService } from '../shared/prometheus/prometheus.service';

/** Caps a window to roughly this many points, never finer than the 30s scrape interval. */
const MAX_POINTS = 300;
const MIN_STEP_SECONDS = 30;

export interface RawServerMetrics {
  cpuPercent: number | null;
  memoryAvailableBytes: number | null;
  memoryTotalBytes: number | null;
  memoryAvailDeriv: number | null;
  /** Keyed by mountpoint: a server has as many disks as it has. */
  diskAvailableBytes: Map<string, number>;
  diskTotalBytes: Map<string, number>;
  diskAvailDeriv: Map<string, number>;
  nodeUp: number | null;
  cadvisorUp: number | null;
  bootTimeSeconds: number | null;
  load1: number | null;
  load5: number | null;
  cpuCount: number | null;
}

export interface ContainerUsage {
  instances: InstanceUsage[];
  engine: EngineUsage[];
}

/** Runs the catalogue's queries and hands back raw numbers. Shapes nothing. */
@Injectable()
export class MetricsReader {
  constructor(private readonly prometheus: PrometheusService) {}

  async serverMetrics(nodeInstance: string, cadvisorInstance: string): Promise<RawServerMetrics> {
    const [
      cpuPercent,
      memoryAvailableBytes,
      memoryTotalBytes,
      memoryAvailDeriv,
      diskAvailableBytes,
      diskTotalBytes,
      diskAvailDeriv,
      nodeUp,
      cadvisorUp,
      bootTimeSeconds,
      load1,
      load5,
      cpuCount,
    ] = await Promise.all([
      this.scalar(queries.nodeCpuPercent(nodeInstance)),
      this.scalar(queries.nodeMemoryAvailableBytes(nodeInstance)),
      this.scalar(queries.nodeMemoryTotalBytes(nodeInstance)),
      this.scalar(queries.nodeMemoryAvailDeriv(nodeInstance)),
      this.byMountpoint(queries.nodeDiskAvailableBytes(nodeInstance)),
      this.byMountpoint(queries.nodeDiskTotalBytes(nodeInstance)),
      this.byMountpoint(queries.nodeDiskAvailDeriv(nodeInstance)),
      this.scalar(queries.targetUp(nodeInstance)),
      this.scalar(queries.targetUp(cadvisorInstance)),
      this.scalar(queries.nodeBootTimeSeconds(nodeInstance)),
      this.scalar(queries.nodeLoad1(nodeInstance)),
      this.scalar(queries.nodeLoad5(nodeInstance)),
      this.scalar(queries.nodeCpuCount(nodeInstance)),
    ]);
    return {
      cpuPercent,
      memoryAvailableBytes,
      memoryTotalBytes,
      memoryAvailDeriv,
      diskAvailableBytes,
      diskTotalBytes,
      diskAvailDeriv,
      nodeUp,
      cadvisorUp,
      bootTimeSeconds,
      load1,
      load5,
      cpuCount,
    };
  }

  /**
   * Memory and CPU, one row per container, from every container on the
   * server — not just application ones. Folded into instances by name and,
   * separately, into the shared engine (traefik/mysql/postgres), which is
   * not an instance and must not be silently dropped just because it does
   * not match either.
   */
  async containerUsage(cadvisorInstance: string): Promise<ContainerUsage> {
    const perContainer = await this.perContainer(cadvisorInstance);

    const instances = new Map<string, InstanceUsage>();
    const engine = new Map<string, EngineUsage>();

    for (const [containerName, usage] of perContainer) {
      const instanceName = instanceOfContainer(containerName);
      if (instanceName) {
        const current = instances.get(instanceName) ?? {
          name: instanceName,
          memoryBytes: 0,
          cpuCores: 0,
          containers: 0,
        };
        instances.set(instanceName, {
          name: instanceName,
          memoryBytes: current.memoryBytes + usage.memoryBytes,
          cpuCores: current.cpuCores + usage.cpuCores,
          containers: current.containers + 1,
        });
        continue;
      }

      const service = engineServiceOfContainer(containerName);
      if (service) {
        const current = engine.get(service) ?? { service, memoryBytes: 0, cpuCores: 0 };
        engine.set(service, {
          service,
          memoryBytes: current.memoryBytes + usage.memoryBytes,
          cpuCores: current.cpuCores + usage.cpuCores,
        });
      }
    }

    return { instances: [...instances.values()], engine: [...engine.values()] };
  }

  /**
   * Every container on a machine, by name and unaggregated — what a `host`
   * server has instead of instances. `instanceOfContainer` deliberately does
   * not apply: these are named whatever docker calls them, not by stack's
   * `app-<instance>-<service>-N` convention.
   */
  async hostContainers(cadvisorInstance: string): Promise<HostContainer[]> {
    const perContainer = await this.perContainer(cadvisorInstance);
    return [...perContainer]
      .map(([name, usage]) => ({ name, ...usage }))
      .sort((a, b) => b.memoryBytes - a.memoryBytes);
  }

  /** Memory and CPU zipped per container name, from the two raw series. */
  private async perContainer(
    cadvisorInstance: string,
  ): Promise<Map<string, { memoryBytes: number; cpuCores: number }>> {
    const [memorySamples, cpuSamples] = await Promise.all([
      this.prometheus.query(queries.containerMemoryBytes(cadvisorInstance)),
      this.prometheus.query(queries.containerCpuCores(cadvisorInstance)),
    ]);

    const perContainer = new Map<string, { memoryBytes: number; cpuCores: number }>();
    for (const sample of memorySamples) {
      const name = sample.metric.name?.replace(/^\//, '');
      if (!name) continue;
      perContainer.set(name, { ...(perContainer.get(name) ?? { cpuCores: 0 }), memoryBytes: sample.value });
    }
    for (const sample of cpuSamples) {
      const name = sample.metric.name?.replace(/^\//, '');
      if (!name) continue;
      perContainer.set(name, { ...(perContainer.get(name) ?? { memoryBytes: 0 }), cpuCores: sample.value });
    }
    return perContainer;
  }

  async backupDuration(nodeInstance: string): Promise<BackupDuration[]> {
    const samples = await this.prometheus.query(queries.backupDurationSeconds(nodeInstance));
    return samples
      .filter((s) => s.metric.mode)
      .map((s) => ({ mode: s.metric.mode, seconds: s.value }));
  }

  /**
   * `server` is an external label attached from `targets/*.json`, present on
   * every alert whose underlying series came from that target — including
   * the fleet-wide rules in capacity.yml/backups.yml, since their PromQL
   * queries `node_*`/`stack_*` series that already carry it.
   */
  async activeAlerts(serverName: string): Promise<ActiveAlert[]> {
    const alerts = await this.prometheus.alerts();
    return alerts
      .filter((a) => a.labels.server === serverName)
      .map((a) => ({
        name: a.labels.alertname,
        severity: a.labels.severity ?? 'warning',
        state: a.state,
        summary: a.annotations.summary ?? a.labels.alertname,
      }));
  }

  /** CPU/memory/disk, percent-used, over the last `hours`. */
  async history(nodeInstance: string, hours: number): Promise<ServerHistory> {
    const end = Math.floor(Date.now() / 1000);
    const start = end - hours * 3600;
    const step = Math.max(MIN_STEP_SECONDS, Math.ceil((end - start) / MAX_POINTS));

    const [cpu, memory, disk] = await Promise.all([
      this.prometheus.queryRange(queries.nodeCpuPercent(nodeInstance), start, end, step),
      this.prometheus.queryRange(queries.nodeMemoryUsedPercent(nodeInstance), start, end, step),
      this.prometheus.queryRange(queries.nodeDiskUsedPercent(nodeInstance), start, end, step),
    ]);

    return { cpu: toPoints(cpu), memory: toPoints(memory), disk: toPoints(disk) };
  }

  /**
   * Every version of `app` deployed on this server within the window, oldest
   * first. Each distinct `version` label is its own series (see
   * `deployInfo`'s comment) — its first and last sample are that version's
   * start and end, and the series with no gap since is the current one.
   */
  async deployHistory(nodeInstance: string, app: string, days: number): Promise<DeployHistoryEntry[]> {
    const end = Math.floor(Date.now() / 1000);
    const start = end - days * 24 * 3600;
    // A scrape every 30s over weeks is far more resolution than a "when did
    // this version start/end" question needs — five minutes is the floor,
    // widened only as far as Prometheus's own 11,000-points-per-series cap
    // requires for the longer end of the range (`days` goes up to 395).
    const step = Math.max(300, Math.ceil((end - start) / MAX_POINTS));

    const series = await this.prometheus.queryRange(queries.deployInfo(nodeInstance, app), start, end, step);

    return series
      .filter((s) => s.values.length > 0 && s.metric.version)
      .map((s) => {
        const timestamps = s.values.map(([t]) => t);
        const lastSeen = Math.max(...timestamps);
        return {
          version: s.metric.version,
          from: new Date(Math.min(...timestamps) * 1000).toISOString(),
          // Within one step of "now" counts as still current — the scrape
          // that would prove it stopped simply has not happened yet.
          to: end - lastSeen <= step ? null : new Date(lastSeen * 1000).toISOString(),
        };
      })
      .sort((a, b) => a.from.localeCompare(b.from));
  }

  /** One series expected per query: one target, one server. */
  /** Every series the query returns, keyed by its `mountpoint` label. */
  private async byMountpoint(promql: string): Promise<Map<string, number>> {
    const samples = await this.prometheus.query(promql);
    return new Map(
      samples
        .filter((s) => s.metric.mountpoint)
        .map((s) => [s.metric.mountpoint, s.value] as const),
    );
  }

  private async scalar(promql: string): Promise<number | null> {
    const [sample] = await this.prometheus.query(promql);
    return sample?.value ?? null;
  }
}

function toPoints(series: { values: [number, number][] }[]): { t: number; v: number }[] {
  return (series[0]?.values ?? []).map(([t, v]) => ({ t, v }));
}
