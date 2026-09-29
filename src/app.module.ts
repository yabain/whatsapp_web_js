import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PasswordAuthGuard } from './auth/password-auth.guard';
import { CommonModule } from './common/common.module';

@Module({
  imports: [CommonModule],
  providers: [
    {
      provide: APP_GUARD,
      useClass: PasswordAuthGuard,
    },
  ],
})
export class AppModule {}
