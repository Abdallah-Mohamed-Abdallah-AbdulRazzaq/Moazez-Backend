import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export type ApplicationEnvironment =
  | 'development'
  | 'test'
  | 'staging'
  | 'production';

export const APPROVED_PRODUCTION_APPLICATION_ORIGINS = Object.freeze([
  'https://schools.moazez.cloud',
  'https://admin.moazez.cloud',
]);

export const APPROVED_STAGING_APPLICATION_ORIGINS = Object.freeze([
  'https://staging-schools.moazez.cloud',
  'https://staging-admin.moazez.cloud',
]);

let configuredApplicationOrigins: readonly string[] = Object.freeze([]);

export function parseApplicationCorsOrigins(
  environment: ApplicationEnvironment,
  rawOrigins: string | undefined,
): readonly string[] {
  if (rawOrigins === undefined || rawOrigins.trim().length === 0) {
    if (environment === 'staging' || environment === 'production') {
      throw new Error(
        'APP_CORS_ORIGINS is required for staging and production',
      );
    }
    return Object.freeze([]);
  }

  const rawEntries = rawOrigins.split(',');
  if (rawEntries.some((entry) => entry.trim().length === 0)) {
    throw new Error('APP_CORS_ORIGINS contains an empty entry');
  }

  const normalized = rawEntries.map((entry) =>
    normalizeApplicationOrigin(entry.trim(), environment),
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('APP_CORS_ORIGINS contains a duplicate origin');
  }

  if (environment === 'production') {
    assertExactOriginSet(
      normalized,
      APPROVED_PRODUCTION_APPLICATION_ORIGINS,
      'production',
    );
  } else if (environment === 'staging') {
    assertExactOriginSet(
      normalized,
      APPROVED_STAGING_APPLICATION_ORIGINS,
      'staging',
    );
  }

  return Object.freeze(normalized);
}

export function configureApplicationCorsOrigins(
  origins: readonly string[],
): void {
  configuredApplicationOrigins = Object.freeze([...origins]);
}

export function createApplicationCorsOptions(
  origins: readonly string[],
): CorsOptions {
  configureApplicationCorsOrigins(origins);
  return {
    origin: applicationCorsOriginDelegate,
    credentials: true,
  };
}

export function applicationCorsOriginDelegate(
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
): void {
  callback(
    null,
    isApplicationOriginAllowed(origin, configuredApplicationOrigins),
  );
}

export function isApplicationOriginAllowed(
  origin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  if (origin === undefined) return true;
  return allowedOrigins.includes(origin);
}

function normalizeApplicationOrigin(
  rawOrigin: string,
  environment: ApplicationEnvironment,
): string {
  if (rawOrigin === '*' || rawOrigin.toLowerCase() === 'null') {
    throw new Error(`APP_CORS_ORIGINS contains a forbidden origin`);
  }

  let parsed: URL;
  try {
    parsed = new URL(rawOrigin);
  } catch {
    throw new Error('APP_CORS_ORIGINS contains an invalid URL');
  }

  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== '' && parsed.pathname !== '/') ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      'APP_CORS_ORIGINS entries may contain only an HTTP(S) scheme, hostname, and optional port',
    );
  }

  if (
    (environment === 'staging' || environment === 'production') &&
    parsed.protocol !== 'https:'
  ) {
    throw new Error(
      `APP_CORS_ORIGINS requires HTTPS origins in ${environment}`,
    );
  }

  if (
    parsed.protocol === 'http:' &&
    environment !== 'staging' &&
    environment !== 'production' &&
    !isLocalhost(parsed.hostname)
  ) {
    throw new Error(
      'Development and test HTTP origins must use a localhost hostname',
    );
  }

  return parsed.origin;
}

function isLocalhost(hostname: string): boolean {
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  );
}

function assertExactOriginSet(
  actual: readonly string[],
  approved: readonly string[],
  environment: 'staging' | 'production',
): void {
  if (
    actual.length !== approved.length ||
    approved.some((origin) => !actual.includes(origin))
  ) {
    throw new Error(
      `APP_CORS_ORIGINS must equal the approved ${environment} origin set`,
    );
  }
}
