import { X509Certificate } from 'node:crypto';
import type { RedisOptions } from 'ioredis';

export type RedisConnectionFamily = 'queue' | 'realtime';
export type RedisRuntimeEnvironment =
  | 'development'
  | 'test'
  | 'staging'
  | 'production';

type RedisConfigurationSource = {
  get<T = unknown>(propertyPath: string): T | undefined;
};

export interface RedisConnectionConfiguration {
  readonly family: RedisConnectionFamily;
  readonly url: string;
  readonly tls?: Readonly<{
    ca?: readonly string[];
    rejectUnauthorized: true;
  }>;
}

interface CreateRedisConnectionConfigurationInput {
  family: RedisConnectionFamily;
  nodeEnvironment: RedisRuntimeEnvironment;
  url: string;
  tlsCaPem?: string;
}

const CERTIFICATE_BLOCK_PATTERN =
  /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/gu;

const REDIS_TLS_URL_QUERY_OPTION_NAMES = new Set([
  'ca',
  'cert',
  'checkserveridentity',
  'ciphers',
  'key',
  'maxversion',
  'minversion',
  'passphrase',
  'pfx',
  'rejectunauthorized',
  'securecontext',
  'secureprotocol',
  'servername',
  'tls',
]);

const REDIS_CONFIGURATION_FIELDS = Object.freeze({
  queue: Object.freeze({
    url: 'QUEUE_REDIS_URL',
    tlsCaPem: 'QUEUE_REDIS_TLS_CA_PEM',
  }),
  realtime: Object.freeze({
    url: 'REALTIME_REDIS_URL',
    tlsCaPem: 'REALTIME_REDIS_TLS_CA_PEM',
  }),
} satisfies Record<
  RedisConnectionFamily,
  { url: string; tlsCaPem: string }
>);

export function getRedisConnectionConfigurationFields(
  family: RedisConnectionFamily,
): Readonly<{ url: string; tlsCaPem: string }> {
  return REDIS_CONFIGURATION_FIELDS[family];
}

export function resolveRedisConnectionConfiguration(
  source: RedisConfigurationSource,
  family: RedisConnectionFamily,
  options: { required: true },
): RedisConnectionConfiguration;
export function resolveRedisConnectionConfiguration(
  source: RedisConfigurationSource,
  family: RedisConnectionFamily,
  options?: { required?: false },
): RedisConnectionConfiguration | null;
export function resolveRedisConnectionConfiguration(
  source: RedisConfigurationSource,
  family: RedisConnectionFamily,
  options: { required?: boolean } = {},
): RedisConnectionConfiguration | null {
  const fields = REDIS_CONFIGURATION_FIELDS[family];
  const nodeEnvironment =
    source.get<RedisRuntimeEnvironment>('NODE_ENV') ?? 'development';
  const url = source.get<string>(fields.url);

  if (!url) {
    if (
      options.required ||
      nodeEnvironment === 'staging' ||
      nodeEnvironment === 'production'
    ) {
      throw new Error(`${fields.url} is required`);
    }
    return null;
  }

  return createRedisConnectionConfiguration({
    family,
    nodeEnvironment,
    url,
    tlsCaPem: source.get<string>(fields.tlsCaPem),
  });
}

export function createRedisConnectionConfiguration(
  input: CreateRedisConnectionConfigurationInput,
): RedisConnectionConfiguration {
  const fields = REDIS_CONFIGURATION_FIELDS[input.family];
  const redisUrl = parseRedisUrl(input.url, fields.url);
  assertRedisUrlDoesNotOverrideTls(redisUrl, fields.url);
  const protocol = redisUrl.protocol;
  const strictEnvironment =
    input.nodeEnvironment === 'staging' ||
    input.nodeEnvironment === 'production';

  if (strictEnvironment && protocol !== 'rediss:') {
    throw new Error(
      `${fields.url} must use rediss: in staging and production`,
    );
  }

  const certificates =
    input.tlsCaPem === undefined
      ? undefined
      : parseRedisTlsCaPem(input.tlsCaPem, fields.tlsCaPem);

  if (strictEnvironment && !certificates) {
    throw new Error(
      `${fields.tlsCaPem} is required in staging and production`,
    );
  }

  const tls =
    protocol === 'rediss:'
      ? Object.freeze({
          ...(certificates ? { ca: Object.freeze([...certificates]) } : {}),
          rejectUnauthorized: true as const,
        })
      : undefined;

  return Object.freeze({
    family: input.family,
    url: input.url,
    ...(tls ? { tls } : {}),
  });
}

export function createRedisClientOptions(
  connection: RedisConnectionConfiguration,
  reliabilityOptions: RedisOptions,
): RedisOptions {
  const options = { ...reliabilityOptions };
  delete options.tls;
  if (!connection.tls) return options;

  return {
    ...options,
    tls: {
      ...(connection.tls.ca ? { ca: [...connection.tls.ca] } : {}),
      rejectUnauthorized: true,
    },
  };
}

export function parseRedisTlsCaPem(
  value: string,
  configurationField = 'Redis TLS CA',
): readonly string[] {
  const blocks = [...value.matchAll(CERTIFICATE_BLOCK_PATTERN)].map((match) =>
    match[0].trim(),
  );
  const remainingMaterial = value.replace(CERTIFICATE_BLOCK_PATTERN, '').trim();

  if (blocks.length === 0 || remainingMaterial.length > 0) {
    throw new Error(
      `${configurationField} must contain only one or more valid PEM CERTIFICATE blocks`,
    );
  }

  try {
    for (const block of blocks) {
      new X509Certificate(block);
    }
  } catch {
    throw new Error(
      `${configurationField} must contain only one or more valid PEM CERTIFICATE blocks`,
    );
  }

  return Object.freeze(blocks);
}

function parseRedisUrl(value: string, configurationField: string): URL {
  try {
    const redisUrl = new URL(value);
    if (redisUrl.protocol === 'redis:' || redisUrl.protocol === 'rediss:') {
      return redisUrl;
    }
  } catch {
    // The field-only error below avoids exposing endpoint components.
  }

  throw new Error(`${configurationField} must be a valid Redis URL`);
}

function assertRedisUrlDoesNotOverrideTls(
  redisUrl: URL,
  configurationField: string,
): void {
  for (const queryOptionName of redisUrl.searchParams.keys()) {
    const normalizedName = queryOptionName
      .toLowerCase()
      .replace(/[^a-z]/gu, '');
    if (
      normalizedName.startsWith('tls') ||
      REDIS_TLS_URL_QUERY_OPTION_NAMES.has(normalizedName)
    ) {
      throw new Error(
        `${configurationField} must not configure TLS options in its query string`,
      );
    }
  }
}
