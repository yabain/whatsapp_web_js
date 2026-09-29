import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import {
  WhatsAppException,
  WhatsAppNotReadyException,
  WhatsAppDisconnectedException,
  WhatsAppAuthFailureException,
  WhatsAppSendFailedException,
  InvalidPhoneNumberException,
} from './whatsapp.exceptions';

@Catch(WhatsAppException)
export class WhatsappExceptionFilter implements ExceptionFilter {
  private readonly statusMap: Record<string, HttpStatus> = {
    WHATSAPP_NOT_READY: HttpStatus.SERVICE_UNAVAILABLE,
    CLIENT_DISCONNECTED: HttpStatus.SERVICE_UNAVAILABLE,
    AUTH_FAILURE: HttpStatus.UNAUTHORIZED,
    INVALID_PHONE_NUMBER: HttpStatus.BAD_REQUEST,
    SEND_FAILED: HttpStatus.INTERNAL_SERVER_ERROR,
  };

  catch(exception: WhatsAppException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const statusCode = this.statusMap[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(statusCode).json({
      statusCode,
      error: exception.code,
      message: exception.message,
      details: exception.details ?? null,
    });
  }
}