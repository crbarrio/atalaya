import { Module } from '@nestjs/common';

import { NotifierModule } from '../notifier/notifier.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EncryptionModule } from '../shared/crypto/encryption.module';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';

@Module({
  imports: [PrismaModule, EncryptionModule, NotifierModule],
  controllers: [ChannelsController],
  providers: [ChannelsService],
})
export class ChannelsModule {}
