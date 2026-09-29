import { LoggerService, LogLevel } from '@nestjs/common';

type LogMetadata = Record<string, unknown>;

/**
 * Structured JSON logger that replaces the default NestJS logger.
 * Outputs all logs as JSON objects for easy ingestion by log aggregators.
 */
export class JsonLogger implements LoggerService {
  private readonly context?: string;

  constructor(context?: string) {
    this.context = context;
  }

  log(message: string, ...optional: unknown[]) {
    this.write('info', message, optional);
  }

  warn(message: string, ...optional: unknown[]) {
    this.write('warn', message, optional);
  }

  error(message: string, ...optional: unknown[]) {
    this.write('error', message, optional);
  }

  debug(message: string, ...optional: unknown[]) {
    this.write('debug', message, optional);
  }

  verbose(message: string, ...optional: unknown[]) {
    this.write('verbose', message, optional);
  }

  private write(level: string, message: string, optional: unknown[]) {
    const meta = this.extractMetadata(optional);

    // Always output to stdout/stderr so PM2/docker can capture logs
    const output = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      context: this.context || 'Application',
      message,
      ...meta,
    });

    if (level === 'error') {
      process.stderr.write(output + '\n');
    } else {
      process.stdout.write(output + '\n');
    }
  }

  private extractMetadata(optional: unknown[]): LogMetadata {
    const meta: LogMetadata = {};

    for (const arg of optional) {
      if (arg instanceof Error) {
        meta.error = arg.message;
        meta.stack = arg.stack?.split('\n').slice(0, 3).join(' | ');
      } else if (typeof arg === 'object' && arg !== null) {
        Object.assign(meta, arg);
      } else if (arg !== undefined) {
        meta.data = arg;
      }
    }

    return meta;
  }
}