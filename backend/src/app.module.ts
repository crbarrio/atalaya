import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';

import { AuditModule } from './shared/audit/audit.module';
import { ActionsModule } from './actions/actions.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChannelsModule } from './channels/channels.module';
import { IncidentsModule } from './incidents/incidents.module';
import { InventoryModule } from './inventory/inventory.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { PrismaModule } from './prisma/prisma.module';
import { RegistrationModule } from './registration/registration.module';
import { SearchModule } from './search/search.module';
import { ServersModule } from './servers/servers.module';
import { SettingsModule } from './settings/settings.module';
import { SshModule } from './shared/ssh/ssh.module';
import { TailscaleIdentityGuard } from './shared/guards/tailscale-identity.guard';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    SshModule,
    InventoryModule,
    ServersModule,
    MonitoringModule,
    WebhooksModule,
    IncidentsModule,
    RegistrationModule,
    SettingsModule,
    ChannelsModule,
    SearchModule,
    ActionsModule,
    AuditModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Identity is required by default. Routes opt out with @Public(), which is
    // the safer direction: forgetting the decorator locks a route down rather
    // than opening it.
    { provide: APP_GUARD, useClass: TailscaleIdentityGuard },
  ],
})
export class AppModule {}
