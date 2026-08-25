import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { SettingsService } from './settings.service';

interface UpdateSettingsRequest {
  healthchecksUrl: string | null;
}

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Values with no other home — today just the Watchdog ping URL.' })
  get() {
    return this.settings.get();
  }

  @Put()
  @ApiOperation({ summary: 'Replace the settings. Pass null to clear a value.' })
  update(@Body() body: UpdateSettingsRequest) {
    return this.settings.update(body.healthchecksUrl);
  }
}
