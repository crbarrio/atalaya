import { Module } from '@nestjs/common';

import { MonitoringModule } from '../monitoring/monitoring.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CatalogueController } from './catalogue.controller';
import { CatalogueService } from './catalogue.service';

@Module({
  imports: [PrismaModule, MonitoringModule],
  controllers: [CatalogueController],
  providers: [CatalogueService],
})
export class CatalogueModule {}
