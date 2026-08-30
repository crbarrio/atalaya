import { Module } from '@nestjs/common';

import { InventoryModule } from '../inventory/inventory.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ActionsController } from './actions.controller';
import { ActionsService } from './actions.service';

@Module({
  imports: [PrismaModule, InventoryModule],
  controllers: [ActionsController],
  providers: [ActionsService],
  // Exported for the variables module, which reuses the instance check and the
  // per-instance lock rather than growing a second version of either.
  exports: [ActionsService],
})
export class ActionsModule {}
