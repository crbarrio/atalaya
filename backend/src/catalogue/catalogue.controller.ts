import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { CatalogueService } from './catalogue.service';

@ApiTags('catalogue')
@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  @Get()
  @ApiOperation({ summary: 'Every application stack knows about, and where each one runs.' })
  apps() {
    return this.catalogue.apps();
  }
}
