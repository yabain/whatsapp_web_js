import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { MetricsService } from '../common/metrics/metrics.service';

describe('WhatsappController', () => {
  let controller: WhatsappController;

  const mockWhatsappService = {
    getStatus: jest.fn(),
    getQr: jest.fn(),
    reset: jest.fn(),
    sendText: jest.fn(),
    sendMedia: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappController],
      providers: [
        { provide: WhatsappService, useValue: mockWhatsappService },
        {
          provide: MetricsService,
          useValue: { incrementCounter: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<WhatsappController>(WhatsappController);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('status', () => {
    it('should return WhatsApp status', async () => {
      mockWhatsappService.getStatus.mockResolvedValue({ status: 'ready', connected: true });
      const result = await controller.status();
      expect(result).toEqual({ status: 'ready', connected: true });
    });
  });

  describe('qr', () => {
    it('should return QR code data', async () => {
      mockWhatsappService.getQr.mockResolvedValue({ qr: 'test-qr', status: 'qr' });
      const result = await controller.qr();
      expect(result).toEqual({ qr: 'test-qr', status: 'qr' });
    });
  });

  describe('reset', () => {
    it('should reset WhatsApp session', async () => {
      mockWhatsappService.reset.mockResolvedValue({ status: 'disconnected' });
      const result = await controller.reset();
      expect(result).toEqual({ status: 'disconnected' });
    });
  });

  describe('sendText', () => {
    it('should call service.sendText and return result', async () => {
      const dto = { phone: '690123456', message: 'Hello' };
      mockWhatsappService.sendText.mockResolvedValue({ sent: true, to: '237690123456' });

      const result = await controller.sendText(dto as any, { ip: '127.0.0.1' });
      expect(mockWhatsappService.sendText).toHaveBeenCalledWith('690123456', 'Hello');
      expect(result).toEqual({ sent: true, to: '237690123456' });
    });

    it('should reject if rate limit exceeded', async () => {
      const dto = { phone: '690123456', message: 'Hi' };

      // Make 10 requests to hit the rate limit
      for (let i = 0; i < 10; i++) {
        await controller.sendText(dto as any, { ip: 'rate-limited' }).catch(() => {});
      }

      // The 11th request should throw
      await expect(
        controller.sendText(dto as any, { ip: 'rate-limited' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('sendMedia', () => {
    it('should call service.sendMedia and return result', async () => {
      const dto = {
        phone: '+237690123456',
        message: 'Check this',
        data: 'base64data',
        mimetype: 'image/png',
      };
      mockWhatsappService.sendMedia.mockResolvedValue({ sent: true });

      const result = await controller.sendMedia(dto as any, { ip: '127.0.0.2' });
      expect(mockWhatsappService.sendMedia).toHaveBeenCalled();
      expect(result).toEqual({ sent: true });
    });
  });
});