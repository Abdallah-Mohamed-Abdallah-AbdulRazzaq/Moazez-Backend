import { rootCertificates } from 'node:tls';
import {
  createRedisClientOptions,
  createRedisConnectionConfiguration,
  parseRedisTlsCaPem,
  resolveRedisConnectionConfiguration,
} from './redis-connection.options';

const QUEUE_CA_PEM = rootCertificates[0];
const REALTIME_CA_PEM = rootCertificates[1];

describe('central Redis endpoint and TLS connection options', () => {
  it.each(['staging', 'production'] as const)(
    'accepts valid rediss and a valid matching CA in %s',
    (nodeEnvironment) => {
      const connection = createRedisConnectionConfiguration({
        family: 'queue',
        nodeEnvironment,
        url: 'rediss://queue-cache.invalid:6379',
        tlsCaPem: QUEUE_CA_PEM,
      });

      expect(connection.tls).toEqual({
        ca: [QUEUE_CA_PEM],
        rejectUnauthorized: true,
      });
    },
  );

  it.each(['staging', 'production'] as const)(
    'rejects rediss without its matching CA in %s',
    (nodeEnvironment) => {
      expect(() =>
        createRedisConnectionConfiguration({
          family: 'queue',
          nodeEnvironment,
          url: 'rediss://queue-cache.invalid:6379',
        }),
      ).toThrow(/QUEUE_REDIS_TLS_CA_PEM/u);
    },
  );

  it.each(['staging', 'production'] as const)(
    'rejects plaintext Redis in %s',
    (nodeEnvironment) => {
      expect(() =>
        createRedisConnectionConfiguration({
          family: 'queue',
          nodeEnvironment,
          url: 'redis://queue-cache.invalid:6379',
          tlsCaPem: QUEUE_CA_PEM,
        }),
      ).toThrow(/QUEUE_REDIS_URL.*rediss:/u);
    },
  );

  it.each(['', 'not-a-certificate', '-----BEGIN CERTIFICATE-----\nbad\n-----END CERTIFICATE-----'])(
    'rejects empty or malformed custom CA material without echoing it',
    (tlsCaPem) => {
      let message = '';
      try {
        createRedisConnectionConfiguration({
          family: 'realtime',
          nodeEnvironment: 'test',
          url: 'rediss://realtime-cache.invalid:6379',
          tlsCaPem,
        });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(message).toContain('REALTIME_REDIS_TLS_CA_PEM');
      if (tlsCaPem) expect(message).not.toContain(tlsCaPem);
    },
  );

  it('accepts and preserves a multi-certificate rotation bundle', () => {
    const bundle = `${QUEUE_CA_PEM}\n${REALTIME_CA_PEM}`;

    expect(parseRedisTlsCaPem(bundle, 'QUEUE_REDIS_TLS_CA_PEM')).toEqual([
      QUEUE_CA_PEM,
      REALTIME_CA_PEM,
    ]);
    expect(
      createRedisConnectionConfiguration({
        family: 'queue',
        nodeEnvironment: 'production',
        url: 'rediss://queue-cache.invalid:6379',
        tlsCaPem: bundle,
      }).tls?.ca,
    ).toEqual([QUEUE_CA_PEM, REALTIME_CA_PEM]);
  });

  it('keeps Queue and Realtime CA values independent', () => {
    const values: Record<string, string> = {
      NODE_ENV: 'production',
      QUEUE_REDIS_URL: 'rediss://queue-cache.invalid:6379',
      QUEUE_REDIS_TLS_CA_PEM: QUEUE_CA_PEM,
      REALTIME_REDIS_URL: 'rediss://realtime-cache.invalid:6379',
      REALTIME_REDIS_TLS_CA_PEM: REALTIME_CA_PEM,
    };
    const source = {
      get: <T>(key: string): T | undefined => values[key] as T | undefined,
    };

    const queue = resolveRedisConnectionConfiguration(source, 'queue', {
      required: true,
    });
    const realtime = resolveRedisConnectionConfiguration(source, 'realtime', {
      required: true,
    });

    expect(queue.tls?.ca).toEqual([QUEUE_CA_PEM]);
    expect(queue.tls?.ca).not.toContain(REALTIME_CA_PEM);
    expect(realtime.tls?.ca).toEqual([REALTIME_CA_PEM]);
    expect(realtime.tls?.ca).not.toContain(QUEUE_CA_PEM);
  });

  it('applies trusted TLS last so callers cannot replace the CA or disable verification', () => {
    const connection = createRedisConnectionConfiguration({
      family: 'queue',
      nodeEnvironment: 'production',
      url: 'rediss://queue-cache.invalid:6379',
      tlsCaPem: QUEUE_CA_PEM,
    });

    const options = createRedisClientOptions(connection, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      tls: {
        ca: REALTIME_CA_PEM,
        rejectUnauthorized: Boolean(0),
      },
    });

    expect(options).toMatchObject({
      lazyConnect: true,
      maxRetriesPerRequest: null,
      tls: {
        ca: [QUEUE_CA_PEM],
        rejectUnauthorized: true,
      },
    });
  });

  it.each([
    'rediss://queue-cache.invalid:6379?tls=',
    'rediss://queue-cache.invalid:6379?TLS%5BrejectUnauthorized%5D=false',
    'rediss://queue-cache.invalid:6379?rejectUnauthorized=false',
  ])(
    'rejects Redis URL query parameters that could override TLS: %s',
    (url) => {
      expect(() =>
        createRedisConnectionConfiguration({
          family: 'queue',
          nodeEnvironment: 'production',
          url,
          tlsCaPem: QUEUE_CA_PEM,
        }),
      ).toThrow(/QUEUE_REDIS_URL.*must not configure TLS options/u);
    },
  );

  it.each(['development', 'test'] as const)(
    'preserves plaintext Redis and reliability options in %s',
    (nodeEnvironment) => {
      const connection = createRedisConnectionConfiguration({
        family: 'queue',
        nodeEnvironment,
        url: 'redis://127.0.0.1:6379',
      });
      const retryStrategy = (): null => null;

      expect(
        createRedisClientOptions(connection, {
          lazyConnect: true,
          enableOfflineQueue: false,
          autoResendUnfulfilledCommands: false,
          maxRetriesPerRequest: 0,
          connectTimeout: 500,
          commandTimeout: 750,
          retryStrategy,
        }),
      ).toEqual({
        lazyConnect: true,
        enableOfflineQueue: false,
        autoResendUnfulfilledCommands: false,
        maxRetriesPerRequest: 0,
        connectTimeout: 500,
        commandTimeout: 750,
        retryStrategy,
      });
    },
  );
});
