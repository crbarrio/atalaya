import { Module } from '@nestjs/common';

import { InventoryModule } from '../inventory/inventory.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';

@Module({
  imports: [InventoryModule, MonitoringModule],
  controllers: [ServersController],
  providers: [ServersService],
})
export class ServersModule {}
