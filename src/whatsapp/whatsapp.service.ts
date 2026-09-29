import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { isAbsolute, join } from 'path';
import * as QRCode from 'qrcode';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import {
  WhatsAppException,
  WhatsAppNotReadyException,
  WhatsAppDisconnectedException,
  WhatsAppAuthFailureException,
  WhatsAppSendFailedException,
  InvalidPhoneNumberException,
} from './exceptions/whatsapp.exceptions';
import { MetricsService } from '../common/metrics/metrics.service';
import { JsonLogger } from '../common/logger/json-logger';

type WhatsappConnectionStatus = 'initializing' | 'qr' | 'authenticated' | 'ready' | 'disconnected' | 'failed';

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new JsonLogger(WhatsappService.name);
  private client: Client | null = null;

  constructor(private readonly metricsService: MetricsService) {}
  private status: WhatsappConnectionStatus = 'disconnected';
  private qrCode: string | null = null;
  private qrCodeDataUrl: string | null = null;
  private connectedNumber: string | null = null;
  private lastError: string | null = null;
  private initializing = false;
  private readyWatchdog: NodeJS.Timeout | null = null;
  private readonly maxRetries = 3;
  private readonly baseDelayMs = 1000; // 1 second base delay
  private readonly maxDelayMs = 8000; // 8 seconds max delay

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
this.metricsService.incrementCounter('connection_init_failures_total');
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
    await this.ensureReady();
    const candidates = this.buildPhoneCandidates(phone);
    const errors: string[] = [];

    // Try each candidate with retry
    for (const candidate of candidates) {
      try {
        const result = await this.sendWithRetry(() => this.sendToCandidate(candidate, message));
        this.metricsService.incrementCounter('messages_sent_total');
        return { sent: true, to: result.chatId, attemptedNumbers: candidates };
      } catch (error: any) {
        this.metricsService.incrementCounter('messages_failed_total');
        errors.push(`${candidate}: ${error?.message || error}`);
      }
    }

    // Try legacy local phone fallback if applicable
    if (this.shouldRetryLegacyLocalPhone(phone, errors)) {
      const retryCandidates = this.buildLegacyLocalPhoneCandidates(phone).filter((candidate) => !candidates.includes(candidate));
      if (retryCandidates.length) {
        await this.restartClient();
        if (!this.client || this.status !== 'ready') {
          errors.push(`legacy retry: WhatsApp is not ready after restart (current status: ${this.status})`);
        } else {
          for (const candidate of retryCandidates) {
            try {
              const result = await this.sendWithRetry(() => this.sendToCandidate(candidate, message));
              this.metricsService.incrementCounter('messages_sent_total');
              this.metricsService.incrementCounter('legacy_retry_success_total');
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

    throw new WhatsAppSendFailedException(this.maxRetries, errors);
  }

  async sendMedia(
    phone: string,
    message: string,
    media: { data: string; mimetype: string; filename?: string },
  ) {
    await this.ensureReady();
    const candidates = this.buildPhoneCandidates(phone);
    const errors: string[] = [];

    for (const candidate of candidates) {
      try {
        const result = await this.sendWithRetry(() => this.sendMediaToCandidate(candidate, message, media));
        this.metricsService.incrementCounter('media_sent_total');
        return { sent: true, to: result.chatId, attemptedNumbers: candidates };
      } catch (error: any) {
        this.metricsService.incrementCounter('media_failed_total');
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
              const result = await this.sendWithRetry(() => this.sendMediaToCandidate(candidate, message, media));
              return { sent: true, to: result.chatId, attemptedNumbers: [...candidates, ...retryCandidates] };
            } catch (error: any) {
              errors.push(`${candidate}: ${error?.message || error}`);
            }
          }
        }
      }
    }

    throw new WhatsAppSendFailedException(this.maxRetries, errors);
  }

  /**
   * Retry with exponential backoff
   * Attempts: 1 (immediate), 2 (+1s), 3 (+2s), 4 (+4s)
   */
  private async sendWithRetry<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        const isLastAttempt = attempt === this.maxRetries;

        // Don't retry on certain permanent errors
        if (error?.message?.includes('Invalid phone number') || error?.message?.includes('not found')) {
          this.logger.warn(`Permanent error on attempt ${attempt}, not retrying: ${error?.message}`);
          throw error;
        }

        if (!isLastAttempt) {
          const delay = Math.min(this.baseDelayMs * Math.pow(2, attempt - 1), this.maxDelayMs);
          this.logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms: ${error?.message}`);
          await this.sleep(delay);
        } else {
          this.logger.error(`All ${this.maxRetries} attempts failed: ${error?.message}`);
        }
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Ensures WhatsApp is ready before sending, with reconnection logic
   */
  private async ensureReady(): Promise<void> {
    // If client exists but is not ready, try to restart
    if (this.client && this.status !== 'ready') {
      this.logger.warn(`WhatsApp not ready (status: ${this.status}), attempting reconnection...`);
      await this.restartClient();
    }

    // If no client, initialize
    if (!this.client) {
      await this.initialize();
    }

    if (!this.client || this.status !== 'ready') {
      throw new WhatsAppNotReadyException(this.status);
    }
  }

  private async initialize() {
    if (this.initializing || this.client) return;
    this.initializing = true;
    this.status = 'initializing';
    this.lastError = null;

    try {
      this.metricsService.incrementCounter('connection_init_attempts_total');
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
      this.logger.log('WhatsApp client initialized successfully');
    } catch (error: any) {
      this.status = 'failed';
      this.lastError = error?.message || String(error);
      this.logger.error(`Unable to initialize WhatsApp client: ${this.lastError}`);
      if (this.client) {
        try { await this.client.destroy(); } catch { /* ignore */ }
      }
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
      this.metricsService.incrementCounter('connection_ready_total');
      this.logger.log(`WhatsApp ready${this.connectedNumber ? ` as ${this.connectedNumber}` : ''}`);
      this.patchLidFunctions();
    });

    client.on('disconnected', (reason) => {
      this.clearReadyWatchdog();
      this.status = 'disconnected';
      this.connectedNumber = null;
      this.lastError = reason || null;
      this.qrCode = null;
      this.qrCodeDataUrl = null;
      this.client = null;
      this.metricsService.incrementCounter('connection_disconnected_total');
      this.logger.warn(`WhatsApp disconnected: ${reason}`);
    });

    client.on('auth_failure', (message) => {
      this.clearReadyWatchdog();
      this.status = 'failed';
      this.lastError = message || 'Authentication failed';
      this.logger.error(`WhatsApp authentication failed: ${this.lastError}`);
    });

    client.on('change_state', (state) => {
      this.logger.debug(`WhatsApp state changed: ${state}`);
    });

    client.on('change_battery', (batteryInfo) => {
      this.logger.debug(`WhatsApp battery changed: ${batteryInfo.battery}%`);
    });
  }

  private async destroyClient() {
    this.clearReadyWatchdog();
    if (!this.client) return;
    try {
      await this.client.destroy();
      this.logger.log('WhatsApp client destroyed successfully');
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

  /**
   * Restart the client with improved error handling
   */
  private async restartClient() {
    this.logger.warn('Restarting WhatsApp client...');
    await this.destroyClient();
    this.status = 'disconnected';
    await this.initialize();

    // Use a string comparison since TypeScript can't track async status changes
    if (`${this.status}` !== 'ready') {
      this.logger.warn(`WhatsApp client restart attempted, current status: ${this.status}`);
    }
  }

  private async patchLidFunctions() {
    if (!this.client?.pupPage) return;
    try {
      await this.client.pupPage.evaluate(() => {
        const wwebjs = (window as any).WWebJS;
        const originalGetChat = wwebjs.getChat;
        wwebjs.getChat = async (chatId: string, options?: any) => {
          try {
            return await originalGetChat(chatId, options);
          } catch (error: any) {
            if (error?.toString?.().includes('No LID for user')) {
              const lidChatId = chatId.replace('@c.us', '@lid');
              return await originalGetChat(lidChatId, options);
            }
            throw error;
          }
        };
      });
      this.logger.log('WhatsApp getChat patched for LID fallback');
    } catch (error: any) {
      this.logger.warn(`Unable to patch getChat: ${error?.message || error}`);
    }
  }

  private async sendToCandidate(candidate: string, message: string) {
    if (!this.client) throw new WhatsAppNotReadyException('client-not-initialized');
    const numberId = await this.client.getNumberId(candidate).catch(() => null);
    const userPart = numberId?.user || candidate;
    const chatId = `${userPart}@c.us`;
    await this.client.sendMessage(chatId, message);
    return { chatId };
  }

  private async sendMediaToCandidate(
    candidate: string,
    message: string,
    media: { data: string; mimetype: string; filename?: string },
  ) {
    if (!this.client) throw new WhatsAppNotReadyException('client-not-initialized');
    const numberId = await this.client.getNumberId(candidate).catch(() => null);
    const userPart = numberId?.user || candidate;
    const chatId = `${userPart}@c.us`;
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

  private buildPhoneCandidates(phone: string): string[] {
    const localDigits = Number(process.env.WHATSAPP_LOCAL_DIGITS || 9);
    const defaultCountryCode = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '';

    // Normalize: remove +, spaces, dashes, parentheses, etc.
    const normalized = String(phone || '').replace(/[+\s\-\(\)]/g, '');
    if (!normalized) throw new InvalidPhoneNumberException(phone);

    // Must be at least 6 digits
    if (normalized.length < 6) throw new InvalidPhoneNumberException(phone);

    // Must contain only digits
    if (!/^\d+$/.test(normalized)) throw new InvalidPhoneNumberException(phone);

    // If the normalized number has exactly the expected local digit count,
    // prepend the default country code to handle local numbers
    if (normalized.length === localDigits) {
      return [`${defaultCountryCode}${normalized}`];
    }

    // Otherwise, return the normalized number as-is (already properly formatted with country code)
    return [normalized];
  }

  private shouldRetryLegacyLocalPhone(phone: string, errors: string[]): boolean {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits.startsWith('6') || digits.length !== 9) return false;
    return errors.some((error) => /detached frame|no lid for user|getchat/i.test(error));
  }

  private buildLegacyLocalPhoneCandidates(phone: string) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits.startsWith('6') || digits.length !== 9) return [];
    return [digits.slice(1), `237${digits}`, `237${digits.slice(1)}`];
  }
}