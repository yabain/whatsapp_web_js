import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PasswordAuthGuard } from './auth/password-auth.guard';
import { WhatsappModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [WhatsappModule],
  providers: [
    {
      provide: APP_GUARD,
      useClass: PasswordAuthGuard,
    },
  ],
})
export class AppModule {}
