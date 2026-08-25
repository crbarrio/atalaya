import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { IncidentsService } from './incidents.service';
import type { SilenceIncidentRequest } from './interfaces/silence-incident.interface';

@ApiTags('incidents')
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  @ApiOperation({ summary: 'Every incident Alertmanager has ever sent, most recent first.' })
  findAll() {
    return this.incidents.findAll();
  }

  @Post(':id/silence')
  @ApiOperation({ summary: "Push a silence to Alertmanager for this incident's exact labels." })
  silence(@Param('id') id: string, @Body() body: SilenceIncidentRequest, @Req() request: Request) {
    const actor = request.user?.login ?? 'unknown';
    return this.incidents.silence(id, body.hours, actor);
  }
}
