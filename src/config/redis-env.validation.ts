import { z } from 'zod';
import {
  createRedisConnectionConfiguration,
  getRedisConnectionConfigurationFields,
  type RedisConnectionFamily,
  type RedisRuntimeEnvironment,
} from './redis-connection.options';

export const redisUrlSchema = z
  .string()
  .url()
  .superRefine((value, context) => {
    try {
      const url = new URL(value);
      if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'must be a valid Redis URL',
        });
      }
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'must be a valid Redis URL',
      });
    }
  });

export const redisTlsCaPemSchema = z.string().optional();

export function refineRedisConnectionSecurity(
  environment: {
    NODE_ENV: RedisRuntimeEnvironment;
  },
  context: z.RefinementCtx,
  families: readonly RedisConnectionFamily[],
): void {
  const values = environment as Record<string, unknown>;
  for (const family of families) {
    const fields = getRedisConnectionConfigurationFields(family);
    const url = values[fields.url];
    const tlsCaPem = values[fields.tlsCaPem];
    if (typeof url !== 'string') continue;

    try {
      createRedisConnectionConfiguration({
        family,
        nodeEnvironment: environment.NODE_ENV,
        url,
        tlsCaPem: typeof tlsCaPem === 'string' ? tlsCaPem : undefined,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `${fields.url} has invalid Redis TLS configuration`;
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [
          message.startsWith(fields.tlsCaPem) ? fields.tlsCaPem : fields.url,
        ],
        message,
      });
    }
  }
}

export function refineRedisEndpointSeparation(
  environment: {
    NODE_ENV: 'development' | 'test' | 'staging' | 'production';
    QUEUE_REDIS_URL: string;
    REALTIME_REDIS_URL: string;
  },
  context: z.RefinementCtx,
): void {
  if (
    environment.NODE_ENV !== 'staging' &&
    environment.NODE_ENV !== 'production'
  ) {
    return;
  }

  const queueEndpoint = redisEndpointIdentity(environment.QUEUE_REDIS_URL);
  const realtimeEndpoint = redisEndpointIdentity(
    environment.REALTIME_REDIS_URL,
  );
  if (
    !queueEndpoint ||
    !realtimeEndpoint ||
    queueEndpoint !== realtimeEndpoint
  ) {
    return;
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['REALTIME_REDIS_URL'],
    message:
      'QUEUE_REDIS_URL and REALTIME_REDIS_URL must use different Redis endpoints in staging and production',
  });
}

function redisEndpointIdentity(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') return null;
    const effectivePort = url.port || '6379';
    return `${url.hostname.toLowerCase()}:${effectivePort}`;
  } catch {
    return null;
  }
}
