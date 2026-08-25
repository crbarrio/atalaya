import { Injectable } from '@nestjs/common';

import { PrometheusService } from '../shared/prometheus/prometheus.service';
import { LivenessTarget } from './interfaces/liveness-target.interface';
import { targetUp } from './monitoring.queries';

/**
 * Names of containers cAdvisor has scraped recently on one server. cAdvisor
 * only reports metrics for containers that are actually running, so presence
 * in this set — not any particular state label — is what "running" means.
 */
@Injectable()
export class MonitoringReader {
  constructor(private readonly prometheus: PrometheusService) {}

  async liveContainers(target: LivenessTarget): Promise<Set<string>> {
    const instance = `${target.tailnetIp}:${target.cadvisorPort}`;
    const samples = await this.prometheus.query(`container_last_seen{instance="${instance}"}`);

    return new Set(
      samples
        .map((s) => s.metric.name)
        .filter((name): name is string => Boolean(name))
        .map((name) => name.replace(/^\//, '')),
    );
  }

  /** `null` when Prometheus has no series at all: not scraped, not "down". */
  async targetUp(instance: string): Promise<number | null> {
    const samples = await this.prometheus.query(targetUp(instance));
    return samples.length > 0 ? samples[0].value : null;
  }
}
