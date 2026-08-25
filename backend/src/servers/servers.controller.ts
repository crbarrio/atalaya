import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { InventoryService } from '../inventory/inventory.service';
import { ServersService } from './servers.service';

@ApiTags('servers')
@Controller('servers')
export class ServersController {
  constructor(
    private readonly servers: ServersService,
    private readonly inventory: InventoryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'One card per server: instances, health, last backup.' })
  findAll() {
    return this.servers.findAll();
  }

  @Get(':name')
  @ApiOperation({ summary: 'A server with its instances, from the cache.' })
  findOne(@Param('name') name: string) {
    return this.servers.findOne(name);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Read every enabled server over SSH and update the cache.' })
  refreshAll() {
    return this.inventory.refreshAll();
  }

  @Post(':name/refresh')
  @ApiOperation({ summary: 'Read one server over SSH and update the cache.' })
  refreshOne(@Param('name') name: string) {
    return this.inventory.refreshServer(name);
  }
}
