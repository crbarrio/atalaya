import { Injectable, Logger } from '@nestjs/common';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { PrismaService } from '../prisma/prisma.service';

interface FileSdTarget {
  targets: string[];
  labels: Record<string, string>;
}

/**
 * Rewrites `targets/*.json` from the database. Prometheus re-reads these on
 * its own (`file_sd_configs`) — no restart, no reload call, no remote write.
 * atalaya touches only its own filesystem; the volume mount into the
 * Prometheus container does the rest.
 */
@Injectable()
export class TargetsService {
  private readonly logger = new Logger(TargetsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** `node.json`/`cadvisor.json` change only on register/deregister — one row per server. */
  async regenerate(): Promise<void> {
    const dir = await this.targetsDir();
    if (!dir) return;

    const servers = await this.prisma.server.findMany({
      where: { enabled: true },
      select: { name: true, tailnetIp: true, nodePort: true, cadvisorPort: true },
      orderBy: { name: 'asc' },
    });

    await this.writeFile(
      dir,
      'node.json',
      servers.map((s) => ({ targets: [`${s.tailnetIp}:${s.nodePort}`], labels: { server: s.name } })),
    );
    await this.writeFile(
      dir,
      'cadvisor.json',
      servers.map((s) => ({ targets: [`${s.tailnetIp}:${s.cadvisorPort}`], labels: { server: s.name } })),
    );
  }

  /**
   * `domains.json`, for `blackbox_exporter`'s TLS probe — one target per
   * domain, not per server: `stack inventory` already gives every instance's
   * `domains[]`, so this changes on every inventory refresh (every instance
   * an app gains or loses a domain), not just on register/deregister.
   * `targets` holds the domain itself, matching blackbox_exporter's own
   * file_sd convention (`__address__` becomes `__param_target`). The label
   * is `app`, not `instance` — Prometheus's relabel_configs sets `instance`
   * to the probed domain itself, and a second, different meaning under the
   * same name would just be silently overwritten.
   */
  async regenerateDomains(): Promise<void> {
    const dir = await this.targetsDir();
    if (!dir) return;

    const instances = await this.prisma.instance.findMany({
      where: { enabled: true, server: { enabled: true } },
      select: { name: true, domains: true, server: { select: { name: true } } },
    });

    const seen = new Set<string>();
    const fileTargets: FileSdTarget[] = [];
    for (const instance of instances) {
      const domains = parseDomains(instance.domains);
      for (const domain of domains) {
        // A domain declared on two instances (a rename mid-flight, a copy-paste
        // in apps.json) must not become two probes fighting over one series.
        if (seen.has(domain)) continue;
        seen.add(domain);
        // `:443` explicit: the TCP prober needs a port, and leaving it
        // implicit would depend on a blackbox_exporter default rather than
        // saying outright that this is always an HTTPS check.
        fileTargets.push({ targets: [`${domain}:443`], labels: { server: instance.server.name, app: instance.name } });
      }
    }

    await this.writeFile(dir, 'domains.json', fileTargets);
  }

  private async targetsDir(): Promise<string | null> {
    const dir = process.env.PROMETHEUS_TARGETS_DIR;
    if (!dir) {
      this.logger.warn('PROMETHEUS_TARGETS_DIR is not set — targets were not regenerated');
      return null;
    }
    await mkdir(dir, { recursive: true });
    return dir;
  }

  /** Temp file + rename: Prometheus's discovery re-reads the directory on its own and would happily read a half-written file. */
  private async writeFile(dir: string, name: string, targets: FileSdTarget[]): Promise<void> {
    const path = join(dir, name);
    const tmpPath = `${path}.tmp`;
    await writeFile(tmpPath, JSON.stringify(targets, null, 2) + '\n');
    await rename(tmpPath, path);
  }
}

function parseDomains(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === 'string') : [];
  } catch {
    return [];
  }
}
