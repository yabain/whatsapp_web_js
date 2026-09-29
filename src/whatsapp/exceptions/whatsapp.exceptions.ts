/**
 * Base class for all WhatsApp-related exceptions
 */
export class WhatsAppException extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'WhatsAppException';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Exception thrown when WhatsApp is not ready to send messages
 */
export class WhatsAppNotReadyException extends WhatsAppException {
  constructor(
    public readonly currentStatus: string,
    message: string = 'WhatsApp is not ready for sending messages',
  ) {
    super(message, 'WHATSAPP_NOT_READY', { currentStatus });
    this.name = 'WhatsAppNotReadyException';
  }
}

/**
 * Exception thrown when a phone number is invalid or cannot be reached
 */
export class InvalidPhoneNumberException extends WhatsAppException {
  constructor(
    public readonly phoneNumber: string,
    message: string = 'Invalid or unreachable phone number',
  ) {
    super(message, 'INVALID_PHONE_NUMBER', { phoneNumber });
    this.name = 'InvalidPhoneNumberException';
  }
}

/**
 * Exception thrown when sending a message fails after all retries
 */
export class WhatsAppSendFailedException extends WhatsAppException {
  constructor(
    public readonly attempts: number,
    public readonly errors: string[],
    message: string = 'Failed to send WhatsApp message after all retries',
  ) {
    super(message, 'SEND_FAILED', { attempts, errors });
    this.name = 'WhatsAppSendFailedException';
  }
}

/**
 * Exception thrown when WhatsApp client is disconnected
 */
export class WhatsAppDisconnectedException extends WhatsAppException {
  constructor(
    public readonly reason: string,
    message: string = 'WhatsApp client is disconnected',
  ) {
    super(message, 'CLIENT_DISCONNECTED', { reason });
    this.name = 'WhatsAppDisconnectedException';
  }
}

/**
 * Exception thrown when WhatsApp authentication fails
 */
export class WhatsAppAuthFailureException extends WhatsAppException {
  constructor(
    message: string = 'WhatsApp authentication failed',
    public readonly authFailureReason?: string,
  ) {
    super(message, 'AUTH_FAILURE', { authFailureReason });
    this.name = 'WhatsAppAuthFailureException';
  }
}