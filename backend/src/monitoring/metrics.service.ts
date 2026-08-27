import { Injectable } from '@nestjs/common';

import {
  ActiveAlert,
  BackupDuration,
  DeployHistoryEntry,
  DiskUsage,
  HostContainer,
  ServerHistory,
  ServerMetrics,
} from './interfaces/server-metrics.interface';
import { ContainerUsage, MetricsReader, RawServerMetrics } from './metrics.reader';

interface MetricsTarget {
  tailnetIp: string;
  nodePort: number;
  cadvisorPort: number;
}

@Injectable()
export class MetricsService {
  constructor(private readonly reader: MetricsReader) {}

  async serverMetrics(target: MetricsTarget): Promise<ServerMetrics> {
    const raw = await this.reader.serverMetrics(
      `${target.tailnetIp}:${target.nodePort}`,
      `${target.tailnetIp}:${target.cadvisorPort}`,
    );
    return {
      cpu: { percent: raw.cpuPercent },
      memory: {
        usedBytes: usedBytes(raw.memoryTotalBytes, raw.memoryAvailableBytes),
        totalBytes: raw.memoryTotalBytes,
        daysRemaining: daysRemaining(raw.memoryAvailableBytes, raw.memoryAvailDeriv),
      },
      disks: disks(raw),
      scrape: { node: upToBoolean(raw.nodeUp), cadvisor: upToBoolean(raw.cadvisorUp) },
      uptime: { seconds: uptimeSeconds(raw.bootTimeSeconds) },
      load: { load1: raw.load1, load5: raw.load5, cpuCount: raw.cpuCount },
    };
  }

  containerUsage(target: MetricsTarget): Promise<ContainerUsage> {
    return this.reader.containerUsage(`${target.tailnetIp}:${target.cadvisorPort}`);
  }

  hostContainers(target: MetricsTarget): Promise<HostContainer[]> {
    return this.reader.hostContainers(`${target.tailnetIp}:${target.cadvisorPort}`);
  }

  backupDuration(target: MetricsTarget): Promise<BackupDuration[]> {
    return this.reader.backupDuration(`${target.tailnetIp}:${target.nodePort}`);
  }

  activeAlerts(serverName: string): Promise<ActiveAlert[]> {
    return this.reader.activeAlerts(serverName);
  }

  history(target: MetricsTarget, hours: number): Promise<ServerHistory> {
    return this.reader.history(`${target.tailnetIp}:${target.nodePort}`, hours);
  }

  deployHistory(target: MetricsTarget, app: string, days: number): Promise<DeployHistoryEntry[]> {
    return this.reader.deployHistory(`${target.tailnetIp}:${target.nodePort}`, app, days);
  }
}

/**
 * One entry per mounted filesystem, fullest first — a server with four disks
 * cares about the one about to fill, not about `/` in particular. Driven by
 * the size series: a disk with no total is not a disk we can say anything
 * about.
 */
function disks(raw: RawServerMetrics): DiskUsage[] {
  return [...raw.diskTotalBytes]
    .map(([mountpoint, totalBytes]) => {
      const availableBytes = raw.diskAvailableBytes.get(mountpoint) ?? null;
      return {
        mountpoint,
        totalBytes,
        usedBytes: usedBytes(totalBytes, availableBytes),
        daysRemaining: daysRemaining(availableBytes, raw.diskAvailDeriv.get(mountpoint) ?? null),
      };
    })
    .sort((a, b) => percentUsed(b) - percentUsed(a));
}

function percentUsed(disk: DiskUsage): number {
  return disk.usedBytes !== null && disk.totalBytes ? disk.usedBytes / disk.totalBytes : 0;
}

function usedBytes(total: number | null, available: number | null): number | null {
  return total !== null && available !== null ? total - available : null;
}

function upToBoolean(up: number | null): boolean | null {
  return up === null ? null : up === 1;
}

function uptimeSeconds(bootTimeSeconds: number | null): number | null {
  return bootTimeSeconds === null ? null : Date.now() / 1000 - bootTimeSeconds;
}

const SECONDS_PER_DAY = 24 * 3600;

/**
 * Same regression `infra/prometheus/rules/capacity.yml`'s `predict_linear`
 * runs, read back as days rather than a boolean alert. Null unless the trend
 * is actually shrinking — a flat or growing available-bytes series has no
 * "time remaining" to report.
 */
function daysRemaining(availableBytes: number | null, deriv: number | null): number | null {
  if (availableBytes === null || deriv === null || deriv >= 0) return null;
  return Math.floor(availableBytes / -deriv / SECONDS_PER_DAY);
}
