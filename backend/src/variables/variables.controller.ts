import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import type { VariablesChange } from './interfaces/variables.interface';
import { VariablesService } from './variables.service';

/**
 * A real `PUT` with a body, unlike `ActionsController` — nothing here streams,
 * so nothing forces the `@Get` that `EventSource` imposed there. It matters
 * more than tidiness: a value in a query string would be in the URL, and URLs
 * end up in history, in referrers and in access logs.
 */
@ApiTags('variables')
@Controller('variables')
export class VariablesController {
  constructor(private readonly variables: VariablesService) {}

  @Get(':server/:instance')
  @ApiOperation({
    summary: 'Which variables an instance declares and which are set. Never a value.',
  })
  report(@Param('server') server: string, @Param('instance') instance: string) {
    return this.variables.report(server, instance);
  }

  @Put(':server/:instance')
  @ApiOperation({ summary: 'Set and unset variables. Write-only: nothing is read back.' })
  write(
    @Param('server') server: string,
    @Param('instance') instance: string,
    @Body() change: VariablesChange,
    @Req() request: Request,
  ) {
    return this.variables.write(server, instance, change, request.user?.login ?? 'unknown');
  }
}
