import { Controller, Get, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AppService } from './app.service';
import { Public } from './shared/decorators/public.decorator';

@ApiTags('system')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Liveness probe. Deliberately unauthenticated.' })
  health() {
    return this.appService.health();
  }

  @Get('me')
  @ApiOperation({ summary: 'Identity as resolved by the guard.' })
  me(@Req() request: Request) {
    return request.user;
  }
}
