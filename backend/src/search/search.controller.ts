import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { SearchService } from './search.service';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Servers by name, instances by name/app/client — for the topbar search.' })
  search(@Query('q') q?: string) {
    return this.searchService.search(q ?? '');
  }
}
