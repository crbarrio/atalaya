import { Module } from '@nestjs/common';

import { AlertmanagerService } from './alertmanager.service';

@Module({
  providers: [AlertmanagerService],
  exports: [AlertmanagerService],
})
export class AlertmanagerModule {}
