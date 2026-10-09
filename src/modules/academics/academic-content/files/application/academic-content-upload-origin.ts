import type { ConfigService } from '@nestjs/config';
import {
  parseApplicationCorsOrigins,
  type ApplicationEnvironment,
} from '../../../../../bootstrap/application-cors.policy';
import { ValidationDomainException } from '../../../../../common/exceptions/domain-exception';

export function resolveAcademicContentUploadOrigin(
  origin: string | undefined,
  config: ConfigService,
): string | undefined {
  if (origin === undefined) return undefined;
  const denied = () =>
    new ValidationDomainException('Browser origin is not approved for uploads');
  if (typeof origin !== 'string') throw denied();
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw denied();
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.origin !== origin
  )
    throw denied();
  const applicationOrigins = parseApplicationCorsOrigins(
    config.get<ApplicationEnvironment>('NODE_ENV') ?? 'development',
    config.get<string>('APP_CORS_ORIGINS'),
  );
  const storageSetting = config.get<readonly string[] | string>(
    'STORAGE_CORS_ORIGINS',
  );
  const storageOrigins =
    typeof storageSetting === 'string'
      ? storageSetting.split(',').map((value) => value.trim())
      : (storageSetting ?? []);
  if (!applicationOrigins.includes(origin) || !storageOrigins.includes(origin))
    throw denied();
  return origin;
}
