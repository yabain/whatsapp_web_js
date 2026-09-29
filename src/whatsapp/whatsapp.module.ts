import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { HealthController } from '../common/controllers/health.controller';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [CommonModule],
  controllers: [WhatsappController, HealthController],
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
