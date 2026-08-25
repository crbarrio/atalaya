import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../shared/decorators/public.decorator';
import type { AlertmanagerWebhookPayload } from './interfaces/alertmanager-webhook.interface';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Public()
  @Post('alertmanager')
  @ApiOperation({
    summary: 'Alertmanager forwards every alert here. Unauthenticated: Alertmanager cannot carry a Tailscale identity header, so this is reachable only from the loopback address it shares with atalaya.',
  })
  async alertmanager(@Body() payload: AlertmanagerWebhookPayload): Promise<{ ok: true }> {
    await this.webhooks.handleAlertmanagerWebhook(payload);
    return { ok: true };
  }
}
