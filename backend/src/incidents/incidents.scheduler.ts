import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { IncidentsService } from './incidents.service';

/** Only decides when incidents are reconciled against Alertmanager. */
@Injectable()
export class IncidentsScheduler {
  private readonly logger = new Logger(IncidentsScheduler.name);

  constructor(private readonly incidents: IncidentsService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcile(): Promise<void> {
    try {
      const closed = await this.incidents.reconcile();
      if (closed) {
        this.logger.log(`Closed ${closed} incident(s) Alertmanager no longer holds as active`);
      }
    } catch (error) {
      // Degrade, do not fail: the incidents stay as they are until the next pass.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Reconciliation skipped: ${message}`);
    }
  }
}
