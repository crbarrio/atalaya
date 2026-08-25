import { Module } from '@nestjs/common';

import { RegistrationModule } from '../registration/registration.module';
import { InventoryReader } from './inventory.reader';
import { InventoryRepository } from './inventory.repository';
import { InventoryScheduler } from './inventory.scheduler';
import { InventoryService } from './inventory.service';

@Module({
  imports: [RegistrationModule],
  providers: [InventoryReader, InventoryRepository, InventoryService, InventoryScheduler],
  exports: [InventoryService],
})
export class InventoryModule {}
