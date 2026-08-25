import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { InventoryService } from './inventory.service';

/** Only decides when a refresh happens. */
@Injectable()
export class InventoryScheduler {
  private readonly logger = new Logger(InventoryScheduler.name);

  constructor(private readonly inventory: InventoryService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async refresh(): Promise<void> {
    const results = await this.inventory.refreshAll();
    const failed = results.filter((r) => !r.ok);
    if (failed.length) {
      this.logger.warn(
        `${failed.length} of ${results.length} servers did not answer: ` +
          failed.map((r) => r.server).join(', '),
      );
    }
  }
}
