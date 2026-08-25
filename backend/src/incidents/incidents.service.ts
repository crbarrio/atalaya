import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AlertmanagerService } from '../shared/alertmanager/alertmanager.service';
import { IncidentView } from './interfaces/incident-view.interface';
import { SilenceIncidentResult } from './interfaces/silence-incident.interface';
import { toIncidentView } from './incidents.mapper';
import { parseLabels } from './parse-labels';

const MS_PER_HOUR = 3600 * 1000;

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alertmanager: AlertmanagerService,
  ) {}

  async findAll(): Promise<IncidentView[]> {
    const rows = await this.prisma.incident.findMany({
      include: { server: { select: { name: true } } },
      orderBy: { receivedAt: 'desc' },
    });
    return rows.map(toIncidentView);
  }

  /**
   * "I know, stop routing this for a while" — pushed straight to Alertmanager's
   * silence API, not stored here. atalaya's own `status` column is left alone:
   * it answers whether the *condition* is still true, which a silence does not
   * change. Matchers come from the alert's own stored label set, so the
   * silence matches exactly what fired — no looser than that.
   */
  async silence(id: string, hours: number, actor: string): Promise<SilenceIncidentResult> {
    const incident = await this.prisma.incident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException(`Unknown incident '${id}'`);

    const labels = parseLabels(incident.labels);
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + hours * MS_PER_HOUR);

    const silenceId = await this.alertmanager.createSilence({
      matchers: Object.entries(labels).map(([name, value]) => ({ name, value, isRegex: false })),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      createdBy: actor,
      comment: `Silenced from atalaya: ${incident.alertName}`,
    });

    return { silenceId, endsAt };
  }
}
