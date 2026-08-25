import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ChannelsService } from './channels.service';
import type {
  CreateNotificationChannelRequest,
  UpdateNotificationChannelRequest,
} from './interfaces/notification-channel.interface';

@ApiTags('channels')
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Get()
  @ApiOperation({ summary: 'Every notification channel. Never carries `config` — write-only.' })
  findAll() {
    return this.channels.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Add a channel.' })
  create(@Body() body: CreateNotificationChannelRequest) {
    return this.channels.create(body);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a channel. Omit `config` to leave existing credentials in place.' })
  update(@Param('id') id: string, @Body() body: UpdateNotificationChannelRequest) {
    return this.channels.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a channel.' })
  remove(@Param('id') id: string) {
    return this.channels.remove(id);
  }
}
