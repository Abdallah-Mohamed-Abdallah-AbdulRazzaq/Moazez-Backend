import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Express } from 'express';
import { AppModule } from './app.module';

const GLOBAL_PREFIX = 'api/v1';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix(GLOBAL_PREFIX);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.enableCors({
    origin: process.env.NODE_ENV === 'production' ? false : true,
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Moazez API')
    .setDescription('Moazez backend HTTP API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${GLOBAL_PREFIX}/docs`, app, swaggerDocument);

  const port = Number(process.env.APP_PORT ?? process.env.PORT ?? 3000);
  await app.listen(port);

  logger.log(`Listening on http://localhost:${port}/${GLOBAL_PREFIX}`);
  logger.log(`Swagger UI: http://localhost:${port}/${GLOBAL_PREFIX}/docs`);
  logRegisteredRoutes(app.getHttpAdapter().getInstance() as Express, logger);
}

function logRegisteredRoutes(server: Express, logger: Logger): void {
  const router = (server as unknown as { _router?: { stack: unknown[] } })._router;
  if (!router) return;

  const routes: string[] = [];
  for (const layer of router.stack as Array<Record<string, unknown>>) {
    const route = layer.route as
      | { path: string; methods: Record<string, boolean> }
      | undefined;
    if (!route) continue;
    const methods = Object.keys(route.methods)
      .filter((m) => route.methods[m])
      .map((m) => m.toUpperCase());
    for (const method of methods) {
      routes.push(`${method.padEnd(6)} ${route.path}`);
    }
  }

  if (routes.length === 0) return;
  logger.log(`Registered routes (${routes.length}):`);
  for (const line of routes.sort()) {
    logger.log(`  ${line}`);
  }
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error:', error);
  process.exit(1);
});
