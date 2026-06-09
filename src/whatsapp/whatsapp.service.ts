import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { isAbsolute, join } from 'path';
import * as QRCode from 'qrcode';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';

type WhatsappConnectionStatus = 'initializing' | 'qr' | 'authenticated' | 'ready' | 'disconnected' | 'failed';

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappService.name);
  private client: Client | null = null;
  private status: WhatsappConnectionStatus = 'disconnected';
  private qrCode: string | null = null;
  private qrCodeDataUrl: string | null = null;
  private connectedNumber: string | null = null;
  private lastError: string | null = null;
  private initializing = false;
  private readyWatchdog: NodeJS.Timeout | null = null;

  async onModuleInit() {
    if (process.env.WHATSAPP_AUTO_INIT === 'false') return;
    void this.initialize().catch((error) => {
      this.status = 'failed';
      this.lastError = error?.message || String(error);
      this.logger.warn(`WhatsApp initialization skipped: ${this.lastError}`);
    });
  }

  async onModuleDestroy() {
    await this.destroyClient();
  }

  async getStatus() {
    return {
      status: this.status,
      connected: this.status === 'ready',
      hasQr: !!this.qrCodeDataUrl,
      connectedNumber: this.connectedNumber,
      lastError: this.lastError,
    };
  }

  async getQr() {
    if (!this.client && !this.initializing) await this.initialize();
    return {
      status: this.status,
      qr: this.qrCode,
      qrDataUrl: this.qrCodeDataUrl,
      connected: this.status === 'ready',
      connectedNumber: this.connectedNumber,
      lastError: this.lastError,
    };
  }

  async reset() {
    await this.destroyClient();
    const authPath = this.getAuthDataPath();
    if (existsSync(authPath)) {
      try {
        rmSync(authPath, { recursive: true, force: true });
      } catch (error: any) {
        this.status = 'failed';
        this.lastError = `Unable to reset WhatsApp session at ${authPath}: ${error?.message || error}`;
        this.logger.warn(this.lastError);
        return this.getStatus();
      }
    }

    this.qrCode = null;
    this.qrCodeDataUrl = null;
    this.connectedNumber = null;
    this.lastError = null;
    this.status = 'disconnected';
    await this.initialize();
    return this.getStatus();
  }

  async sendText(phone: string, message: string) {
    if (!this.client || this.status !== 'ready') {
      throw new BadRequestException(`WhatsApp is not ready (current status: ${this.status})`);
    }

    const candidates = this.buildPhoneCandidates(phone);
    const errors: string[] = [];

    for (const candidate of candidates) {
      try {
        const result = await this.sendToCandidate(candidate, message);
        return { sent: true, to: result.chatId, attemptedNumbers: candidates };
      } catch (error: any) {
        errors.push(`${candidate}: ${error?.message || error}`);
      }
    }

    if (this.shouldRetryLegacyLocalPhone(phone, errors)) {
      const retryCandidates = this.buildLegacyLocalPhoneCandidates(phone).filter((candidate) => !candidates.includes(candidate));
      if (retryCandidates.length) {
        await this.restartClient();
        if (!this.client || this.status !== 'ready') {
          errors.push(`legacy retry: WhatsApp is not ready after restart (current status: ${this.status})`);
        } else {
          for (const candidate of retryCandidates) {
            try {
              const result = await this.sendToCandidate(candidate, message);
              return {
                sent: true,
                to: result.chatId,
                attemptedNumbers: [...candidates, ...retryCandidates],
              };
            } catch (error: any) {
              errors.push(`${candidate}: ${error?.message || error}`);
            }
          }
        }
      }
    }

    throw new BadRequestException(`Unable to send WhatsApp message. Attempts: ${errors.join(' | ')}`);
  }

  async sendMedia(
    phone: string,
    message: string,
    media: { data: string; mimetype: string; filename?: string },
  ) {
    if (!this.client || this.status !== 'ready') {
      throw new BadRequestException(`WhatsApp is not ready (current status: ${this.status})`);
    }

    const candidates = this.buildPhoneCandidates(phone);
    const errors: string[] = [];
    for (const candidate of candidates) {
      try {
        const result = await this.sendMediaToCandidate(candidate, message, media);
        return { sent: true, to: result.chatId, attemptedNumbers: candidates };
      } catch (error: any) {
        errors.push(`${candidate}: ${error?.message || error}`);
      }
    }

    if (this.shouldRetryLegacyLocalPhone(phone, errors)) {
      const retryCandidates = this.buildLegacyLocalPhoneCandidates(phone).filter((candidate) => !candidates.includes(candidate));
      for (const candidate of retryCandidates) {
        try {
          const result = await this.sendMediaToCandidate(candidate, message, media);
          return { sent: true, to: result.chatId, attemptedNumbers: [...candidates, ...retryCandidates] };
        } catch (error: any) {
          errors.push(`${candidate}: ${error?.message || error}`);
        }
      }
    }

    throw new BadRequestException(`Unable to send WhatsApp media. Attempts: ${errors.join(' | ')}`);
  }

  private async initialize() {
    if (this.initializing || this.client) return;
    this.initializing = true;
    this.status = 'initializing';
    this.lastError = null;

    try {
      const authPath = this.getAuthDataPath();
      mkdirSync(authPath, { recursive: true });

      this.client = new Client({
        authStrategy: new LocalAuth({
          clientId: 'eat-app',
          dataPath: authPath,
        }),
        puppeteer: {
          headless: true,
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
          ],
        },
      });

      this.registerEvents(this.client);
      await this.client.initialize();
    } catch (error: any) {
      this.status = 'failed';
      this.lastError = error?.message || String(error);
      this.logger.warn(`Unable to initialize WhatsApp client: ${this.lastError}`);
      this.client = null;
    } finally {
      this.initializing = false;
    }
  }

  private registerEvents(client: Client) {
    client.on('qr', async (qr) => {
      this.status = 'qr';
      this.qrCode = qr;
      this.qrCodeDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
      this.logger.log('WhatsApp QR code generated');
    });

    client.on('authenticated', () => {
      this.status = 'authenticated';
      this.lastError = null;
      this.logger.log('WhatsApp authenticated');
      this.scheduleReadyWatchdog();
    });

    client.on('ready', () => {
      this.clearReadyWatchdog();
      this.status = 'ready';
      this.qrCode = null;
      this.qrCodeDataUrl = null;
      this.connectedNumber = this.client?.info?.wid?.user || null;
      this.logger.log(`WhatsApp ready${this.connectedNumber ? ` as ${this.connectedNumber}` : ''}`);
    });

    client.on('disconnected', (reason) => {
      this.clearReadyWatchdog();
      this.status = 'disconnected';
      this.connectedNumber = null;
      this.lastError = reason || null;
      this.qrCode = null;
      this.qrCodeDataUrl = null;
      this.client = null;
      this.logger.warn(`WhatsApp disconnected: ${reason}`);
    });

    client.on('auth_failure', (message) => {
      this.clearReadyWatchdog();
      this.status = 'failed';
      this.lastError = message || 'Authentication failed';
      this.logger.warn(`WhatsApp authentication failed: ${this.lastError}`);
    });
  }

  private async destroyClient() {
    this.clearReadyWatchdog();
    if (!this.client) return;
    try {
      await this.client.destroy();
    } catch (error: any) {
      this.logger.warn(`Unable to destroy WhatsApp client: ${error?.message || error}`);
    } finally {
      this.client = null;
      this.initializing = false;
    }
  }

  private scheduleReadyWatchdog() {
    this.clearReadyWatchdog();
    const timeoutMs = Number(process.env.WHATSAPP_READY_TIMEOUT_MS || 90000);
    this.readyWatchdog = setTimeout(() => {
      if (this.status !== 'authenticated') return;
      this.lastError = `WhatsApp authenticated but not ready after ${Math.round(timeoutMs / 1000)}s. Restarting client.`;
      this.logger.warn(this.lastError);
      void this.restartClient();
    }, timeoutMs);
  }

  private clearReadyWatchdog() {
    if (!this.readyWatchdog) return;
    clearTimeout(this.readyWatchdog);
    this.readyWatchdog = null;
  }

  private async restartClient() {
    await this.destroyClient();
    this.status = 'disconnected';
    await this.initialize();
  }

  private async sendToCandidate(candidate: string, message: string) {
    if (!this.client) throw new BadRequestException('WhatsApp client is not initialized');
    const numberId = await this.client.getNumberId(candidate).catch(() => null);
    const chatId = numberId?._serialized || `${candidate}@c.us`;
    await this.client.sendMessage(chatId, message);
    return { chatId };
  }

  private async sendMediaToCandidate(
    candidate: string,
    message: string,
    media: { data: string; mimetype: string; filename?: string },
  ) {
    if (!this.client) throw new BadRequestException('WhatsApp client is not initialized');
    const numberId = await this.client.getNumberId(candidate).catch(() => null);
    const chatId = numberId?._serialized || `${candidate}@c.us`;
    await this.client.sendMessage(
      chatId,
      new MessageMedia(media.mimetype, media.data, media.filename || 'image'),
      { caption: message },
    );
    return { chatId };
  }

  private getAuthDataPath() {
    const configured = process.env.WHATSAPP_SESSION_DIR || 'whatsapp-session';
    return isAbsolute(configured) ? configured : join(process.cwd(), configured);
  }

  private buildPhoneCandidates(phone: string) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) throw new BadRequestException('Phone number is required');

    const candidates = [digits];
    if (digits.startsWith('2376') && digits.length === 12) {
      candidates.push(`237${digits.slice(4)}`);
    }
    if (digits.startsWith('6') && digits.length === 9) {
      candidates.push(digits.slice(1));
      candidates.push(`237${digits}`);
      candidates.push(`237${digits.slice(1)}`);
    }

    return [...new Set(candidates)];
  }

  private shouldRetryLegacyLocalPhone(phone: string, errors: string[]) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits.startsWith('6') || digits.length !== 9) return false;
    return errors.some((error) => /detached frame|no lid for user|getchat/i.test(error));
  }

  private buildLegacyLocalPhoneCandidates(phone: string) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits.startsWith('6') || digits.length !== 9) return [];
    return [digits.slice(1), `237${digits.slice(1)}`];
  }
}
