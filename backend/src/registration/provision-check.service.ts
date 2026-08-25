import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { PrometheusService } from '../shared/prometheus/prometheus.service';
import {
  ProvisionCheckName,
  ProvisionCheckResult,
  ProvisionCheckView,
} from './interfaces/provision-check.interface';

const PROBE_TIMEOUT_MS = 5_000;

/**
 * Three traffic lights, in order of what they actually prove: does the
 * collector answer at all (direct probe, reachable the moment the script
 * finishes — before targets are even regenerated), then does Prometheus
 * itself see it as `UP` (proves the whole chain: targets regenerated,
 * reloaded, scraped successfully).
 */
@Injectable()
export class ProvisionCheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prometheus: PrometheusService,
  ) {}

  async verify(name: string): Promise<ProvisionCheckView[]> {
    const server = await this.prisma.server.findUnique({ where: { name } });
    if (!server) throw new NotFoundException(`Unknown server '${name}'`);

    const nodeInstance = `${server.tailnetIp}:${server.nodePort}`;
    const cadvisorInstance = `${server.tailnetIp}:${server.cadvisorPort}`;

    const [nodeExporter, cadvisor, prometheusTarget] = await Promise.all([
      this.probe(`http://${nodeInstance}/metrics`),
      this.probe(`http://${cadvisorInstance}/metrics`),
      this.checkPrometheusTargets(nodeInstance, cadvisorInstance),
    ]);

    const checks: [ProvisionCheckName, ProvisionCheckResult, string | null][] = [
      ['node_exporter', nodeExporter.result, nodeExporter.detail],
      ['cadvisor', cadvisor.result, cadvisor.detail],
      ['prometheus_target', prometheusTarget.result, prometheusTarget.detail],
    ];

    const checkedAt = new Date();
    await this.prisma.$transaction(
      checks.map(([check, result, detail]) =>
        this.prisma.provisionCheck.create({
          data: { serverId: server.id, check, result, detail, checkedAt },
        }),
      ),
    );

    return checks.map(([check, result, detail]) => ({ check, result, detail, checkedAt }));
  }

  private async probe(url: string): Promise<{ result: ProvisionCheckResult; detail: string | null }> {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      return response.ok
        ? { result: 'pass', detail: null }
        : { result: 'fail', detail: `HTTP ${response.status}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { result: 'fail', detail: message };
    }
  }

  private async checkPrometheusTargets(
    nodeInstance: string,
    cadvisorInstance: string,
  ): Promise<{ result: ProvisionCheckResult; detail: string | null }> {
    try {
      const [nodeUp, cadvisorUp] = await Promise.all([
        this.prometheus.query(`up{instance="${nodeInstance}"}`),
        this.prometheus.query(`up{instance="${cadvisorInstance}"}`),
      ]);
      const missing: string[] = [];
      if (nodeUp[0]?.value !== 1) missing.push('node');
      if (cadvisorUp[0]?.value !== 1) missing.push('cadvisor');
      return missing.length === 0
        ? { result: 'pass', detail: null }
        : { result: 'fail', detail: `Prometheus does not see ${missing.join(' or ')} as up` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { result: 'fail', detail: message };
    }
  }
}
