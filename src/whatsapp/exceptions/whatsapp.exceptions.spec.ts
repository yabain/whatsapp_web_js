import {
  WhatsAppException,
  WhatsAppNotReadyException,
  InvalidPhoneNumberException,
  WhatsAppSendFailedException,
  WhatsAppDisconnectedException,
  WhatsAppAuthFailureException,
} from './whatsapp.exceptions';

describe('WhatsAppException', () => {
  it('should create a base exception with message, code, and details', () => {
    const ex = new WhatsAppException('Test error', 'TEST_CODE', { key: 'value' });
    expect(ex.message).toBe('Test error');
    expect(ex.code).toBe('TEST_CODE');
    expect(ex.details).toEqual({ key: 'value' });
    expect(ex.name).toBe('WhatsAppException');
  });

  it('should create a base exception without details', () => {
    const ex = new WhatsAppException('Minimal', 'MINIMAL');
    expect(ex.details).toBeUndefined();
  });
});

describe('WhatsAppNotReadyException', () => {
  it('should create with default message and current status', () => {
    const ex = new WhatsAppNotReadyException('disconnected');
    expect(ex.code).toBe('WHATSAPP_NOT_READY');
    expect(ex.message).toContain('not ready');
    expect(ex.details).toEqual({ currentStatus: 'disconnected' });
  });
});

describe('InvalidPhoneNumberException', () => {
  it('should create with phone number details', () => {
    const ex = new InvalidPhoneNumberException('12345');
    expect(ex.code).toBe('INVALID_PHONE_NUMBER');
    expect(ex.details).toEqual({ phoneNumber: '12345' });
  });
});

describe('WhatsAppSendFailedException', () => {
  it('should create with attempts and errors', () => {
    const ex = new WhatsAppSendFailedException(3, ['error1', 'error2']);
    expect(ex.code).toBe('SEND_FAILED');
    expect(ex.details).toEqual({ attempts: 3, errors: ['error1', 'error2'] });
  });
});

describe('WhatsAppDisconnectedException', () => {
  it('should create with disconnect reason', () => {
    const ex = new WhatsAppDisconnectedException('Connection closed');
    expect(ex.code).toBe('CLIENT_DISCONNECTED');
    expect(ex.details).toEqual({ reason: 'Connection closed' });
  });
});

describe('WhatsAppAuthFailureException', () => {
  it('should create with auth failure reason', () => {
    const ex = new WhatsAppAuthFailureException('Token expired');
    expect(ex.code).toBe('AUTH_FAILURE');
    expect(ex.details).toEqual({ authFailureReason: 'Token expired' });
  });

  it('should create with default message', () => {
    const ex = new WhatsAppAuthFailureException();
    expect(ex.message).toBe('WhatsApp authentication failed');
    expect(ex.details).toEqual({ authFailureReason: undefined });
  });
});