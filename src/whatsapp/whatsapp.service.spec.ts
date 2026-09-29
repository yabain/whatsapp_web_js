import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappService } from './whatsapp.service';
import { MetricsService } from '../common/metrics/metrics.service';
import { InvalidPhoneNumberException, WhatsAppNotReadyException } from './exceptions/whatsapp.exceptions';

describe('WhatsappService', () => {
  let service: WhatsappService;
  let metricsService: MetricsService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappService,
        {
          provide: MetricsService,
          useValue: {
            incrementCounter: jest.fn(),
            observeHistogram: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
    metricsService = module.get<MetricsService>(MetricsService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Set env vars for tests
    process.env.WHATSAPP_DEFAULT_COUNTRY_CODE = '237';
    process.env.WHATSAPP_LOCAL_DIGITS = '9';
  });

  // --- buildPhoneCandidates ---

  describe('buildPhoneCandidates', () => {
    it('should normalize a phone number by removing + and spaces', () => {
      const candidates = (service as any).buildPhoneCandidates('+237 690 123 456');
      expect(candidates).toEqual(['237690123456']);
    });

    it('should normalize a phone number by removing dashes and parentheses', () => {
      const candidates = (service as any).buildPhoneCandidates('+1 (555) 012-345');
      expect(candidates).toEqual(['1555012345']);
    });

    it('should prepend default country code for a local number (9 digits)', () => {
      const candidates = (service as any).buildPhoneCandidates('690123456');
      expect(candidates).toEqual(['237690123456']);
    });

    it('should NOT prepend country code for numbers with 10 digits (US format)', () => {
      const candidates = (service as any).buildPhoneCandidates('1555012345');
      expect(candidates).toEqual(['1555012345']);
    });

    it('should reject an empty phone number', () => {
      expect(() => (service as any).buildPhoneCandidates('')).toThrow(InvalidPhoneNumberException);
    });

    it('should reject a phone number with less than 6 digits', () => {
      expect(() => (service as any).buildPhoneCandidates('12345')).toThrow(InvalidPhoneNumberException);
    });

    it('should reject a phone number with non-digit characters after normalization', () => {
      expect(() => (service as any).buildPhoneCandidates('abc123def456')).toThrow(InvalidPhoneNumberException);
    });

    it('should handle a full international number with +', () => {
      const candidates = (service as any).buildPhoneCandidates('+33612345678');
      expect(candidates).toEqual(['33612345678']);
    });

    it('should respect WHATSAPP_LOCAL_DIGITS=10 when configured', () => {
      process.env.WHATSAPP_LOCAL_DIGITS = '10';
      const candidates = (service as any).buildPhoneCandidates('0612345678');
      expect(candidates).toEqual(['2370612345678']);
    });

    it('should use default 9 when WHATSAPP_LOCAL_DIGITS is not set', () => {
      delete process.env.WHATSAPP_LOCAL_DIGITS;
      const candidates = (service as any).buildPhoneCandidates('690123456');
      expect(candidates).toEqual(['237690123456']);
    });

    it('should handle empty default country code gracefully', () => {
      process.env.WHATSAPP_DEFAULT_COUNTRY_CODE = '';
      const candidates = (service as any).buildPhoneCandidates('690123456');
      expect(candidates).toEqual(['690123456']);
    });

    it('should strip multiple spaces and + signs', () => {
      const candidates = (service as any).buildPhoneCandidates('+1  555 012 345');
      expect(candidates).toEqual(['1555012345']);
    });
  });

  // --- sendWithRetry ---

  describe('sendWithRetry', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const result = await (service as any).sendWithRetry(operation);
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry with exponential backoff and succeed on 2nd attempt', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('temporary'))
        .mockResolvedValueOnce('success');

      const result = await (service as any).sendWithRetry(operation);
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry with exponential backoff and succeed on 3rd attempt', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('error1'))
        .mockRejectedValueOnce(new Error('error2'))
        .mockResolvedValueOnce('success');

      const result = await (service as any).sendWithRetry(operation);
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should throw after all retries exhausted', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('persistent error'));

      await expect((service as any).sendWithRetry(operation)).rejects.toThrow('persistent error');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should NOT retry on permanent errors (invalid phone)', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Invalid phone number'));

      await expect((service as any).sendWithRetry(operation)).rejects.toThrow('Invalid phone number');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on "not found" errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('not found'));

      await expect((service as any).sendWithRetry(operation)).rejects.toThrow('not found');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  // --- ensureReady ---

  describe('ensureReady', () => {
    it('should throw WhatsAppNotReadyException when client is null', async () => {
      (service as any).client = null;
      (service as any).status = 'disconnected';
      // Since initialize will fail without a real Client, we expect an exception
      await expect((service as any).ensureReady()).rejects.toThrow(WhatsAppNotReadyException);
    });
  });
});