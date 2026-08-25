import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { PrometheusModule } from '../shared/prometheus/prometheus.module';
import { ProvisionCheckService } from './provision-check.service';
import { RegistrationController } from './registration.controller';
import { RegistrationService } from './registration.service';
import { SelfRegisterService } from './self-register.service';
import { SetupScriptService } from './setup-script.service';
import { TargetsService } from './targets.service';

@Module({
  imports: [PrismaModule, PrometheusModule],
  controllers: [RegistrationController],
  providers: [
    RegistrationService,
    SelfRegisterService,
    SetupScriptService,
    ProvisionCheckService,
    TargetsService,
  ],
  exports: [TargetsService],
})
export class RegistrationModule {}
