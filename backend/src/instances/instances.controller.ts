import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { InstancesService } from './instances.service';
import type { CreateInstanceRequest } from './interfaces/instance-plan.interface';

/**
 * Two `POST`s rather than a `POST` and a `GET`: a preview takes the whole
 * declaration as its input, which is a body, and it runs a command on a server
 * rather than reading anything atalaya holds.
 */
@ApiTags('instances')
@Controller('instances')
export class InstancesController {
  constructor(private readonly instances: InstancesService) {}

  @Post(':server/preview')
  @ApiOperation({ summary: 'What creating this instance would do. Writes nothing.' })
  preview(@Param('server') server: string, @Body() body: CreateInstanceRequest) {
    return this.instances.preview(server, body);
  }

  @Post(':server')
  @ApiOperation({ summary: 'Declare an instance, write its secrets file and create its database.' })
  create(
    @Param('server') server: string,
    @Body() body: CreateInstanceRequest,
    @Req() request: Request,
  ) {
    return this.instances.create(server, body, request.user?.login ?? 'unknown');
  }
}
