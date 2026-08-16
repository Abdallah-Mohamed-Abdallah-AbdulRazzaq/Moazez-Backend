import IORedis from 'ioredis';
import { rootCertificates } from 'node:tls';
import {
  createRedisConnectionConfiguration,
} from '../../../config/redis-connection.options';
import { createRealtimeEmitterRedisClient } from '../realtime-emitter.module';

jest.mock('ioredis');

describe('Realtime emitter Redis TLS connection', () => {
  const MockedIORedis = jest.mocked(IORedis);
  const realtimeCaPem = rootCertificates[1];

  beforeEach(() => {
    MockedIORedis.mockReset();
  });

  it('uses only the Realtime CA while preserving emitter reliability options', () => {
    const connection = createRedisConnectionConfiguration({
      family: 'realtime',
      nodeEnvironment: 'production',
      url: 'rediss://realtime-cache.invalid:6379',
      tlsCaPem: realtimeCaPem,
    });

    createRealtimeEmitterRedisClient(connection);

    expect(MockedIORedis).toHaveBeenCalledWith(
      'rediss://realtime-cache.invalid:6379',
      expect.objectContaining({
        lazyConnect: true,
        enableOfflineQueue: false,
        autoResendUnfulfilledCommands: false,
        maxRetriesPerRequest: 0,
        connectTimeout: 400,
        commandTimeout: 400,
        connectionName: 'moazez-realtime-emitter',
        tls: {
          ca: [realtimeCaPem],
          rejectUnauthorized: true,
        },
      }),
    );
  });

  it('preserves the existing test redis: construction contract', () => {
    const connection = createRedisConnectionConfiguration({
      family: 'realtime',
      nodeEnvironment: 'test',
      url: 'redis://127.0.0.1:6379',
    });

    createRealtimeEmitterRedisClient(connection);

    const redisCalls = MockedIORedis.mock.calls as unknown as Array<
      [string, Record<string, unknown>]
    >;
    const options = redisCalls[0][1];
    expect(options).toMatchObject({
      lazyConnect: true,
      enableOfflineQueue: false,
      autoResendUnfulfilledCommands: false,
      maxRetriesPerRequest: 0,
      connectTimeout: 400,
      commandTimeout: 400,
      connectionName: 'moazez-realtime-emitter',
    });
    expect(options).not.toHaveProperty('tls');
  });
});
