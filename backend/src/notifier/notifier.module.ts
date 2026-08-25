import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { EncryptionModule } from '../shared/crypto/encryption.module';
import { EmailAdapter } from './adapters/email.adapter';
import { TelegramAdapter } from './adapters/telegram.adapter';
import { NotifierService } from './notifier.service';

@Module({
  imports: [PrismaModule, EncryptionModule],
  providers: [NotifierService, EmailAdapter, TelegramAdapter],
  exports: [NotifierService],
})
export class NotifierModule {}
