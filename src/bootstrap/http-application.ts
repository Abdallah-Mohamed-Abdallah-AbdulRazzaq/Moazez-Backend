import { Logger, type INestApplication, ValidationPipe } from '@nestjs/common';
import {
  createApplicationCorsOptions,
  parseApplicationCorsOrigins,
  type ApplicationEnvironment,
} from './application-cors.policy';
import { GLOBAL_PREFIX, SWAGGER_PATH } from './application-metadata';
import { configureSwagger } from './swagger';

export interface HttpApplicationPolicy {
  environment: ApplicationEnvironment;
  corsOrigins: string | undefined;
  swaggerEnabled: boolean;
}

export interface ConfiguredHttpApplication {
  allowedOrigins: readonly string[];
  swaggerEnabled: boolean;
}

export function configureHttpApplication(
  app: INestApplication,
  policy: HttpApplicationPolicy,
): ConfiguredHttpApplication {
  if (policy.environment === 'production' && policy.swaggerEnabled) {
    throw new Error('SWAGGER_ENABLED=true is forbidden in production');
  }

  const allowedOrigins = parseApplicationCorsOrigins(
    policy.environment,
    policy.corsOrigins,
  );

  app.setGlobalPrefix(GLOBAL_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableCors(createApplicationCorsOptions(allowedOrigins));

  return {
    allowedOrigins,
    swaggerEnabled: configureSwagger(app, policy.swaggerEnabled),
  };
}

export function logHttpApplicationStarted(
  logger: Pick<Logger, 'log'>,
  port: number,
  configured: ConfiguredHttpApplication,
): void {
  logger.log(`Listening on http://localhost:${port}/${GLOBAL_PREFIX}`);
  if (configured.swaggerEnabled) {
    logger.log(`Swagger UI: http://localhost:${port}/${SWAGGER_PATH}`);
  }
}
