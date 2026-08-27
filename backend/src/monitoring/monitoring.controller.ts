import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../prisma/prisma.service';
import { DiskPreferencesService } from './disk-preferences.service';
import { MetricsService } from './metrics.service';
import { MonitoringService } from './monitoring.service';

@ApiTags('monitoring')
@Controller('monitoring')
export class MonitoringController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly monitoring: MonitoringService,
    private readonly metricsService: MetricsService,
    private readonly diskPrefs: DiskPreferencesService,
  ) {}

  @Get(':name')
  @ApiOperation({ summary: 'Live container state per instance, read straight from Prometheus.' })
  async liveness(@Param('name') name: string) {
    const server = await this.prisma.server.findUnique({
      where: { name },
      include: { instances: { select: { name: true }, orderBy: { name: 'asc' } } },
    });
    if (!server) throw new NotFoundException(`Unknown server '${name}'`);

    return this.monitoring.liveness(
      { tailnetIp: server.tailnetIp, cadvisorPort: server.cadvisorPort },
      server.instances.map((i) => i.name),
    );
  }

  @Get(':name/metrics')
  @ApiOperation({ summary: 'CPU/RAM/disk for one server, plus memory per instance.' })
  async metrics(@Param('name') name: string) {
    const server = await this.prisma.server.findUnique({ where: { name } });
    if (!server) throw new NotFoundException(`Unknown server '${name}'`);

    const target = {
      tailnetIp: server.tailnetIp,
      nodePort: server.nodePort,
      cadvisorPort: server.cadvisorPort,
    };
    const [serverMetrics, containers, backup, alerts] = await Promise.all([
      this.metricsService.serverMetrics(target),
      this.metricsService.containerUsage(target),
      this.metricsService.backupDuration(target),
      this.metricsService.activeAlerts(server.name),
    ]);
    return {
      server: serverMetrics,
      instances: containers.instances,
      engine: containers.engine,
      backup,
      alerts,
    };
  }

  @Get(':name/disks/preferences')
  @ApiOperation({ summary: 'Which disk alerts are switched off, per mountpoint.' })
  listDiskPreferences(@Param('name') name: string) {
    return this.diskPrefs.list(name);
  }

  @Put(':name/disks/preferences')
  @ApiOperation({ summary: 'Switch a disk alert on or off for one mountpoint.' })
  updateDiskPreference(
    @Param('name') name: string,
    @Body() body: { mountpoint: string; trendAlerts?: boolean; capacityAlerts?: boolean },
  ) {
    const { mountpoint, ...changes } = body;
    if (!mountpoint) throw new BadRequestException('mountpoint is required');
    return this.diskPrefs.update(name, mountpoint, changes);
  }

  @Get(':name/containers')
  @ApiOperation({ summary: 'Every container on one machine, by name — what a host server has instead of instances.' })
  async containers(@Param('name') name: string) {
    const server = await this.prisma.server.findUnique({ where: { name } });
    if (!server) throw new NotFoundException(`Unknown server '${name}'`);

    return this.metricsService.hostContainers({
      tailnetIp: server.tailnetIp,
      nodePort: server.nodePort,
      cadvisorPort: server.cadvisorPort,
    });
  }

  @Get(':name/history')
  @ApiOperation({ summary: 'CPU/RAM/disk, percent-used, over a window — for the historical charts.' })
  async history(@Param('name') name: string, @Query('hours') hoursParam?: string) {
    const server = await this.prisma.server.findUnique({ where: { name } });
    if (!server) throw new NotFoundException(`Unknown server '${name}'`);

    const hours = clamp(Number(hoursParam) || 24, 1, 24 * 30);
    return this.metricsService.history(
      { tailnetIp: server.tailnetIp, nodePort: server.nodePort, cadvisorPort: server.cadvisorPort },
      hours,
    );
  }

  @Get(':name/:instance/deploys')
  @ApiOperation({ summary: 'Every version of this instance seen in Prometheus, oldest first.' })
  async deployHistory(
    @Param('name') name: string,
    @Param('instance') instance: string,
    @Query('days') daysParam?: string,
  ) {
    const server = await this.prisma.server.findUnique({ where: { name } });
    if (!server) throw new NotFoundException(`Unknown server '${name}'`);

    const days = clamp(Number(daysParam) || 90, 1, 395);
    return this.metricsService.deployHistory(
      { tailnetIp: server.tailnetIp, nodePort: server.nodePort, cadvisorPort: server.cadvisorPort },
      instance,
      days,
    );
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
