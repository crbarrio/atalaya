import { Injectable } from '@nestjs/common';

import { instanceOfContainer } from './container-name';
import { InstanceLiveness, LivenessTarget } from './interfaces/liveness-target.interface';
import { MonitoringReader } from './monitoring.reader';

@Injectable()
export class MonitoringService {
  constructor(private readonly reader: MonitoringReader) {}

  async liveness(target: LivenessTarget, instanceNames: string[]): Promise<InstanceLiveness[]> {
    const live = await this.reader.liveContainers(target);
    const byInstance = new Map<string, string[]>();
    for (const container of live) {
      const name = instanceOfContainer(container);
      if (!name) continue;
      byInstance.set(name, [...(byInstance.get(name) ?? []), container]);
    }

    return instanceNames.map((name) => {
      const liveContainers = byInstance.get(name) ?? [];
      return {
        name,
        state: liveContainers.length > 0 ? 'running' : 'stopped',
        liveContainers,
      };
    });
  }

  /** Whether Prometheus reached a collector on its last scrape; `null` if never scraped. */
  targetUp(instance: string): Promise<number | null> {
    return this.reader.targetUp(instance);
  }
}
