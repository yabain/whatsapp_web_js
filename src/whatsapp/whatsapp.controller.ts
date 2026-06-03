import { Body, Controller, Get, Post } from '@nestjs/common';
import { SendWhatsappDto } from './dto/send-whatsapp.dto';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('status')
  status() {
    return this.whatsappService.getStatus();
  }

  @Get('qr')
  qr() {
    return this.whatsappService.getQr();
  }

  @Post('reset')
  reset() {
    return this.whatsappService.reset();
  }

  @Post('send-test')
  sendTest(@Body() dto: SendWhatsappDto) {
    return this.whatsappService.sendText(dto.phone, dto.message);
  }

  @Post('send-text')
  sendText(@Body() dto: SendWhatsappDto) {
    return this.whatsappService.sendText(dto.phone, dto.message);
  }
}
