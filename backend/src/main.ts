import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './shared/http/global-http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:4200',
    credentials: true,
  });

  const swagger = new DocumentBuilder()
    .setTitle('atalaya')
    .setDescription('Server management and monitoring panel')
    .setVersion('0.0.1')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  const port = Number(process.env.PORT ?? 3000);

  // Loopback only, and not as a default that can be overridden casually.
  //
  // Identity comes from the Tailscale-User-Login header that `tailscale serve`
  // injects. A header is only trustworthy if nothing else can reach the port to
  // set it by hand — so binding anywhere other than the loopback address makes
  // every user on the tailnet able to impersonate anyone. The guard refuses to
  // trust the header unless this holds.
  const host = process.env.HOST ?? '127.0.0.1';

  await app.listen(port, host);

  const logger = new Logger('bootstrap');
  logger.log(`atalaya API listening on http://${host}:${port}/api`);
  if (!isLoopback(host)) {
    logger.warn(
      `HOST is ${host}, not a loopback address. Tailscale header identity is ` +
        `disabled while this is the case: it would be forgeable.`,
    );
  }
}

export function isLoopback(host: string): boolean {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost';
}

void bootstrap();
