import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { OverviewService } from './overview.service';

@ApiTags('overview')
@Controller('overview')
export class OverviewController {
  constructor(private readonly overview: OverviewService) {}

  @Get()
  @ApiOperation({ summary: 'What needs attention right now, and what was done recently.' })
  get() {
    return this.overview.get();
  }
}
