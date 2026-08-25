import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { PrometheusModule } from '../shared/prometheus/prometheus.module';
import { MetricsReader } from './metrics.reader';
import { MetricsService } from './metrics.service';
import { MonitoringController } from './monitoring.controller';
import { MonitoringReader } from './monitoring.reader';
import { MonitoringService } from './monitoring.service';

@Module({
  imports: [PrismaModule, PrometheusModule],
  controllers: [MonitoringController],
  providers: [MonitoringReader, MonitoringService, MetricsReader, MetricsService],
  exports: [MonitoringService, MetricsService],
})
export class MonitoringModule {}
