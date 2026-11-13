import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { AlertmanagerModule } from '../shared/alertmanager/alertmanager.module';
import { IncidentsController } from './incidents.controller';
import { IncidentsScheduler } from './incidents.scheduler';
import { IncidentsService } from './incidents.service';

@Module({
  imports: [PrismaModule, AlertmanagerModule],
  controllers: [IncidentsController],
  providers: [IncidentsService, IncidentsScheduler],
})
export class IncidentsModule {}
