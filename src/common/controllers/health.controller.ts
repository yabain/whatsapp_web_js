import { Controller, Get } from '@nestjs/common';
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
    const mem = process.memoryUsage();

    const formatMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)}MB`;

    return {
      status: whatsappStatus.connected ? 'ok' : 'degraded',
      uptime: metrics.uptimeSeconds,
      whatsapp: {
        status: whatsappStatus.status,
        lastError: whatsappStatus.lastError || null,
        connectedSince: whatsappStatus.connectedSince || null,
        messagesSent: metrics.counters['messages_sent_total'] || 0,
        messagesFailed: metrics.counters['messages_failed_total'] || 0,
      },
      memory: {
        rss: formatMB(mem.rss),
        heapUsed: formatMB(mem.heapUsed),
        heapTotal: formatMB(mem.heapTotal),
      },
    };
  }

  @Get('metrics')
  metrics(): string {
    return this.metricsService.textFormat();
  }
}