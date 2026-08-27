import { Module } from '@nestjs/common';

import { InventoryModule } from '../inventory/inventory.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ActionsController } from './actions.controller';
import { ActionsService } from './actions.service';

@Module({
  imports: [PrismaModule, InventoryModule],
  controllers: [ActionsController],
  providers: [ActionsService],
})
export class ActionsModule {}
