import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { APPLICATION_VERSION, SWAGGER_PATH } from './application-metadata';

export function configureSwagger(
  app: INestApplication,
  enabled: boolean,
): boolean {
  if (!enabled) return false;

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Moazez API')
    .setDescription(
      'Moazez backend HTTP API. All routes are served under /api/v1.',
    )
    .setVersion(APPLICATION_VERSION)
    .addBearerAuth()
    .addTag('auth', 'Authentication, sessions, and current actor identity')
    .addTag('settings-users', 'School user identity management')
    .addTag(
      'settings-login-identity',
      'School login domains, username policy, and generated login emails',
    )
    .addTag('settings-user-credentials', 'Password credential provisioning')
    .addTag(
      'settings-email-connection',
      'School outbound email provider connection',
    )
    .addTag('settings-email-templates', 'School email templates and previews')
    .addTag(
      'settings-email-credential-deliveries',
      'Queue-backed credential email delivery',
    )
    .addTag('settings-email-deliveries', 'Email delivery batch monitoring')
    .addTag('settings-email-campaigns', 'General school email campaigns')
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(SWAGGER_PATH, app, swaggerDocument);
  return true;
}
