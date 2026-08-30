import { Module } from '@nestjs/common';

import { ActionsModule } from '../actions/actions.module';
import { InventoryModule } from '../inventory/inventory.module';
import { InstancesController } from './instances.controller';
import { InstancesService } from './instances.service';

@Module({
  imports: [ActionsModule, InventoryModule],
  controllers: [InstancesController],
  providers: [InstancesService],
})
export class InstancesModule {}
