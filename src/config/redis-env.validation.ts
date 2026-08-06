import { z } from 'zod';

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
