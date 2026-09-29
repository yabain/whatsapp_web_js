import { BadRequestException, Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SendWhatsappDto, SendWhatsappMediaDto } from './dto/send-whatsapp.dto';
import { WhatsappService } from './whatsapp.service';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

@ApiTags('WhatsApp')
@ApiBearerAuth()
@Controller('whatsapp')
export class WhatsappController {
  private readonly rateLimitMap = new Map<string, RateLimitEntry>();
  private readonly rateLimitWindowMs = 60000; // 1 minute
  private readonly rateLimitMaxRequests = 10; // max 10 requests per minute per IP

  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get WhatsApp connection status' })
  @ApiResponse({ status: 200, description: 'Connection status returned' })
  status() {
    return this.whatsappService.getStatus();
  }

  @Get('qr')
  @ApiOperation({ summary: 'Get current QR code for authentication' })
  @ApiResponse({ status: 200, description: 'QR code data returned' })
  qr() {
    return this.whatsappService.getQr();
  }

  @Post('reset')
  @ApiOperation({ summary: 'Reset WhatsApp session and clear authentication' })
  @ApiResponse({ status: 201, description: 'Session reset and reconnecting' })
  reset() {
    return this.whatsappService.reset();
  }

  @Post('send-test')
  @ApiOperation({ summary: '[DEPRECATED] Send a test WhatsApp text message' })
  @ApiBody({ type: SendWhatsappDto })
  @ApiResponse({ status: 201, description: 'Message sent' })
  @ApiResponse({ status: 400, description: 'Invalid phone number or WhatsApp not ready' })
  sendTest(@Body() dto: SendWhatsappDto, @Req() req: any) {
    this.checkRateLimit(req.ip);
    return this.whatsappService.sendText(dto.phone, dto.message);
  }

  @Post('send-text')
  @ApiOperation({ summary: 'Send a WhatsApp text message' })
  @ApiBody({ type: SendWhatsappDto, description: 'Phone number and message text' })
  @ApiResponse({ status: 201, description: 'Message sent' })
  @ApiResponse({ status: 400, description: 'Validation error or send failure' })
  @ApiResponse({ status: 503, description: 'WhatsApp not connected' })
  sendText(@Body() dto: SendWhatsappDto, @Req() req: any) {
    this.checkRateLimit(req.ip);
    return this.whatsappService.sendText(dto.phone, dto.message);
  }

  @Post('send-media')
  @ApiOperation({ summary: 'Send a WhatsApp message with media attachment' })
  @ApiBody({ type: SendWhatsappMediaDto })
  @ApiResponse({ status: 201, description: 'Media message sent' })
  @ApiResponse({ status: 400, description: 'Validation error or send failure' })
  @ApiResponse({ status: 503, description: 'WhatsApp not connected' })
  sendMedia(@Body() dto: SendWhatsappMediaDto, @Req() req: any) {
    this.checkRateLimit(req.ip);
    return this.whatsappService.sendMedia(dto.phone, dto.message, {
      data: dto.data,
      mimetype: dto.mimetype,
      filename: dto.filename,
    });
  }

  private checkRateLimit(ip: string) {
    const now = Date.now();
    const entry = this.rateLimitMap.get(ip);

    if (!entry || now > entry.resetTime) {
      this.rateLimitMap.set(ip, {
        count: 1,
        resetTime: now + this.rateLimitWindowMs,
      });
      return;
    }

    entry.count++;

    if (entry.count > this.rateLimitMaxRequests) {
      const secondsRemaining = Math.ceil((entry.resetTime - now) / 1000);
      throw new BadRequestException(
        `Rate limit exceeded. Try again in ${secondsRemaining} seconds.`
      );
    }
  }
}
