import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import { MonitoringService } from '../monitoring/monitoring.service';
import { PrismaService } from '../prisma/prisma.service';
import { SshService } from '../shared/ssh/ssh.service';
import {
  CatalogueAppView,
  CatalogueDeployment,
  StackCatalogue,
} from './interfaces/catalogue.interface';

/** The catalogue changes when someone edits apps.json, which is rarely. */
const CACHE_MS = 5 * 60_000;

/**
 * What applications exist, and where each one runs.
 *
 * The catalogue comes from `apps.json`, which reaches every server from the
 * same git repo — so it is fleet-wide information that happens to live on each
 * machine. It is read from one server rather than merged from all of them, and
 * which one is reported, because a server on `develop` can legitimately carry a
 * newer catalogue than one on `main`.
 *
 * Where each app runs comes from the instance cache, which atalaya already has.
 */
@Injectable()
export class CatalogueService {
  private readonly logger = new Logger(CatalogueService.name);
  private cached: { at: number; source: string; catalogue: StackCatalogue } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ssh: SshService,
    private readonly monitoring: MonitoringService,
  ) {}

  async apps(): Promise<{ source: string; registry: string; apps: CatalogueAppView[] }> {
    const { catalogue, source } = await this.read();
    const deployments = await this.deployments();

    return {
      source,
      registry: catalogue.registry,
      apps: catalogue.apps.map((app) => ({
        ...app,
        deployments: deployments.get(app.name) ?? [],
      })),
    };
  }

  /**
   * Instances grouped by the catalogue app they came from.
   *
   * `unknown` is resolved against cAdvisor the same way the server pages do it:
   * SSH reports `unknown` because the reading account cannot see docker, which
   * is the normal case, and a badge saying so everywhere would be noise rather
   * than information. One Prometheus query per server, not per instance.
   */
  private async deployments(): Promise<Map<string, CatalogueDeployment[]>> {
    const rows = await this.prisma.instance.findMany({
      where: { server: { enabled: true } },
      select: {
        name: true,
        app: true,
        client: true,
        version: true,
        state: true,
        server: { select: { name: true, tailnetIp: true, cadvisorPort: true } },
      },
      orderBy: [{ app: 'asc' }, { name: 'asc' }],
    });

    const live = await this.liveStates(rows);

    const byApp = new Map<string, CatalogueDeployment[]>();
    for (const row of rows) {
      if (!row.app) continue;
      const entry: CatalogueDeployment = {
        server: row.server.name,
        instance: row.name,
        client: row.client,
        version: row.version,
        state:
          row.state === 'unknown'
            ? (live.get(`${row.server.name}/${row.name}`) ?? row.state)
            : row.state,
      };
      byApp.set(row.app, [...(byApp.get(row.app) ?? []), entry]);
    }
    return byApp;
  }

  /** Live container state keyed `server/instance`. Empty when Prometheus is unreachable. */
  private async liveStates(
    rows: { name: string; state: string | null; server: { name: string; tailnetIp: string; cadvisorPort: number } }[],
  ): Promise<Map<string, string>> {
    const byServer = new Map<string, { target: { tailnetIp: string; cadvisorPort: number }; names: string[] }>();
    for (const row of rows) {
      if (row.state !== 'unknown') continue;
      const existing = byServer.get(row.server.name);
      if (existing) existing.names.push(row.name);
      else
        byServer.set(row.server.name, {
          target: { tailnetIp: row.server.tailnetIp, cadvisorPort: row.server.cadvisorPort },
          names: [row.name],
        });
    }

    const resolved = new Map<string, string>();
    await Promise.all(
      [...byServer].map(async ([server, { target, names }]) => {
        try {
          for (const instance of await this.monitoring.liveness(target, names)) {
            resolved.set(`${server}/${instance.name}`, instance.state);
          }
        } catch (error) {
          // Prometheus being down must not empty the catalogue; the rows keep
          // whatever SSH said, which is honest about not knowing.
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Liveness unavailable for ${server}: ${message}`);
        }
      }),
    );
    return resolved;
  }

  /**
   * Read from the first reachable stack server, cached briefly. Falling
   * through the list rather than pinning one machine: the catalogue is the
   * same everywhere, so any server that answers will do, and one being down
   * should not blank the screen.
   */
  private async read(): Promise<{ catalogue: StackCatalogue; source: string }> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) {
      return { catalogue: this.cached.catalogue, source: this.cached.source };
    }

    const servers = await this.prisma.server.findMany({
      where: { enabled: true, kind: 'stack' },
      orderBy: { name: 'asc' },
    });

    const failures: string[] = [];
    for (const server of servers) {
      try {
        const raw = await this.ssh.run(
          {
            name: server.name,
            host: server.host,
            port: server.sshPort,
            user: server.sshUser,
            keyPath: server.sshKeyPath,
            stackPath: server.stackPath,
          },
          { command: 'catalogue' },
        );
        const catalogue = JSON.parse(raw) as StackCatalogue;
        this.cached = { at: Date.now(), source: server.name, catalogue };
        return { catalogue, source: server.name };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${server.name}: ${message}`);
      }
    }

    // Stale beats empty: a catalogue read an hour ago is still almost
    // certainly current, and apps.json changes rarely.
    if (this.cached) {
      this.logger.warn(`Serving a stale catalogue: ${failures.join('; ')}`);
      return { catalogue: this.cached.catalogue, source: `${this.cached.source} (stale)` };
    }

    throw new ServiceUnavailableException(
      failures.length
        ? `No server could return the catalogue. ${failures[0]}`
        : 'No stack server is registered.',
    );
  }
}
