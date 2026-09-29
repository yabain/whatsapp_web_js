import { Controller, Get, Req } from '@nestjs/common';
import { WhatsappService } from '../../whatsapp/whatsapp.service';
import { MetricsService } from '../metrics/metrics.service';

@Controller()
export class HealthController {
  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly metricsService: MetricsService,
  ) {}

  @Get('health')
  async health() {
    const whatsappStatus = await this.whatsappService.getStatus();
    const metrics = this.metricsService.snapshot();

    return {
      status: whatsappStatus.connected ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: metrics.uptimeSeconds,
      whatsapp: whatsappStatus,
    };
  }

  @Get('metrics')
  metrics(): string {
    return this.metricsService.textFormat();
  }
}