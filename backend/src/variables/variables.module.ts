import { Module } from '@nestjs/common';

import { ActionsModule } from '../actions/actions.module';
import { VariablesController } from './variables.controller';
import { VariablesService } from './variables.service';

@Module({
  imports: [ActionsModule],
  controllers: [VariablesController],
  providers: [VariablesService],
})
export class VariablesModule {}
