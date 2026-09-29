import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { json } from 'express';
import { AppModule } from './app.module';
import { WhatsappExceptionFilter } from './whatsapp/exceptions/whatsapp-exception.filter';
import { JsonLogger } from './common/logger/json-logger';

const DEFAULT_PORT = 3003;

// Load .env file manually (no dotenv dependency required)
function loadEnvFile() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eqIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function validateEnvironment() {
  const requiredVars = ['WHATSAPP_GATEWAY_PASSWORD'];
  const missing: string[] = [];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. Please check your .env file.`
    );
  }

  if (process.env.WHATSAPP_LOCAL_DIGITS && !process.env.WHATSAPP_DEFAULT_COUNTRY_CODE) {
    throw new Error(
      'WHATSAPP_DEFAULT_COUNTRY_CODE is required when WHATSAPP_LOCAL_DIGITS is set'
    );
  }

  if (process.env.WHATSAPP_LOCAL_DIGITS) {
    const digits = Number(process.env.WHATSAPP_LOCAL_DIGITS);
    if (isNaN(digits) || digits <= 0) {
      throw new Error('WHATSAPP_LOCAL_DIGITS must be a positive number');
    }
  }
}

function requestIdMiddleware(req: any, _res: any, next: Function) {
  req.requestId = req.headers['x-request-id']
    || `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  next();
}

async function bootstrap() {
  loadEnvFile();
  validateEnvironment();

  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: new JsonLogger('System'),
  });

  app.use(requestIdMiddleware);
  app.use(json({ limit: '10mb' }));
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new WhatsappExceptionFilter());

  // Swagger / OpenAPI documentation
  const config = new DocumentBuilder()
    .setTitle('Eat WhatsApp Gateway')
    .setDescription('WhatsApp messaging API for sending text and media messages')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT || DEFAULT_PORT);
  await app.listen(port);
  new JsonLogger('Bootstrap').log(`WhatsApp Gateway running on port ${port}`);
}

bootstrap();