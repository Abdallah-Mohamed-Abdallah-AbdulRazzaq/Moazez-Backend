import type { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { rootCertificates } from 'node:tls';
import type { Env } from '../../../config/env.validation';
import { RealtimeAuthService } from '../realtime-auth.service';
import { RealtimeCommunicationAccessService } from '../realtime-communication-access.service';
import { RealtimePresenceService } from '../realtime-presence.service';
import { RealtimePublisherService } from '../realtime-publisher.service';
import { RealtimeTypingService } from '../realtime-typing.service';
import { RealtimeGateway } from '../realtime.gateway';

jest.mock('ioredis');
jest.mock('@socket.io/redis-adapter', () => ({
  createAdapter: jest.fn(() => jest.fn()),
}));
jest.mock('../realtime-auth.service', () => ({
  RealtimeAuthService: class RealtimeAuthService {},
}));
jest.mock('../realtime-communication-access.service', () => ({
  RealtimeCommunicationAccessService:
    class RealtimeCommunicationAccessService {},
}));
jest.mock('../realtime-presence.service', () => ({
  RealtimePresenceService: class RealtimePresenceService {},
}));
jest.mock('../realtime-publisher.service', () => ({
  RealtimePublisherService: class RealtimePublisherService {},
}));
jest.mock('../realtime-typing.service', () => ({
  RealtimeTypingService: class RealtimeTypingService {},
}));

type RedisClientDouble = {
  status: string;
  connect: jest.Mock<Promise<void>, []>;
  ping: jest.Mock<Promise<string>, []>;
  quit: jest.Mock<Promise<string>, []>;
  disconnect: jest.Mock<void, []>;
  duplicate: jest.Mock<RedisClientDouble, [Record<string, unknown>?]>;
  on: jest.Mock<RedisClientDouble, [string, (...args: unknown[]) => void]>;
};

type RealtimeGatewayInternals = {
  redisPublisher?: IORedis;
  redisSubscriber?: IORedis;
  adapterLifecycleState: string;
  server: unknown;
  pingRedisAdapterClients: () => Promise<void>;
  ensureRedisAdapterReady: () => Promise<boolean>;
  configureRedisAdapter: (server: unknown) => Promise<boolean>;
  closeRedisClient: (client?: IORedis) => Promise<void>;
};

describe('RealtimeGateway Redis command ownership', () => {
  const MockedIORedis = jest.mocked(IORedis);

  beforeEach(() => {
    jest.useFakeTimers();
    MockedIORedis.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('waits for a pending subscriber after an immediate publisher rejection', async () => {
    const subscriberPing = deferred<string>();
    const publisher = redisClient({
      ping: jest.fn().mockRejectedValue(new Error('publisher unavailable')),
    });
    const subscriber = redisClient({
      ping: jest.fn().mockReturnValue(subscriberPing.promise),
    });
    const internals = gatewayInternals(createGateway(), publisher, subscriber);

    const readiness = internals.pingRedisAdapterClients();
    let settled = false;
    void readiness.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await flushPromises();

    expect(settled).toBe(false);
    expect(publisher.ping).toHaveBeenCalledTimes(1);
    expect(subscriber.ping).toHaveBeenCalledTimes(1);

    subscriberPing.resolve('PONG');
    await expect(readiness).rejects.toThrow('realtime_redis_unavailable');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('waits for a pending publisher after an immediate subscriber rejection', async () => {
    const publisherPing = deferred<string>();
    const publisher = redisClient({
      ping: jest.fn().mockReturnValue(publisherPing.promise),
    });
    const subscriber = redisClient({
      ping: jest.fn().mockRejectedValue(new Error('subscriber unavailable')),
    });
    const internals = gatewayInternals(createGateway(), publisher, subscriber);

    const readiness = internals.pingRedisAdapterClients();
    let settled = false;
    void readiness.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await flushPromises();

    expect(settled).toBe(false);
    publisherPing.resolve('PONG');
    await expect(readiness).rejects.toThrow('realtime_redis_unavailable');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('bounds callers while retaining and sharing the underlying ping flight', async () => {
    const publisherPing = deferred<string>();
    const subscriberPing = deferred<string>();
    const publisher = redisClient({
      ping: jest.fn().mockReturnValue(publisherPing.promise),
    });
    const subscriber = redisClient({
      ping: jest.fn().mockReturnValue(subscriberPing.promise),
    });
    const internals = gatewayInternals(createGateway(), publisher, subscriber);

    const first = internals.pingRedisAdapterClients();
    jest.advanceTimersByTime(600);
    await expect(first).rejects.toThrow('realtime_redis_unavailable');

    const second = internals.pingRedisAdapterClients();
    await flushPromises();
    expect(publisher.ping).toHaveBeenCalledTimes(1);
    expect(subscriber.ping).toHaveBeenCalledTimes(1);

    publisherPing.resolve('PONG');
    subscriberPing.resolve('PONG');
    await expect(second).resolves.toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('observes a late child rejection without an unhandled rejection', async () => {
    const publisherPing = deferred<string>();
    const subscriberPing = deferred<string>();
    const publisher = redisClient({
      ping: jest.fn().mockReturnValue(publisherPing.promise),
    });
    const subscriber = redisClient({
      ping: jest.fn().mockReturnValue(subscriberPing.promise),
    });
    const internals = gatewayInternals(createGateway(), publisher, subscriber);
    const unhandled: unknown[] = [];
    const listener = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', listener);

    try {
      const readiness = internals.pingRedisAdapterClients();
      jest.advanceTimersByTime(600);
      await expect(readiness).rejects.toThrow('realtime_redis_unavailable');

      publisherPing.resolve('PONG');
      subscriberPing.reject(new Error('late subscriber failure'));
      await flushPromises();

      expect(unhandled).toEqual([]);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      process.off('unhandledRejection', listener);
    }
  });

  it('retires half-open clients within the caller deadline and starts recovery independently', async () => {
    const publisherPing = deferred<string>();
    const subscriberPing = deferred<string>();
    const publisher = redisClient({
      ping: jest.fn().mockReturnValue(publisherPing.promise),
    });
    const subscriber = redisClient({
      ping: jest.fn().mockReturnValue(subscriberPing.promise),
    });
    const gateway = createGateway();
    const internals = gatewayInternals(gateway, publisher, subscriber);
    internals.adapterLifecycleState = 'ready';
    internals.server = { sockets: new Map() };
    const recovery = jest
      .spyOn(internals, 'ensureRedisAdapterReady')
      .mockResolvedValue(false);

    const readiness = gateway.checkReadiness();
    jest.advanceTimersByTime(600);
    await expect(readiness).rejects.toThrow('realtime_redis_unavailable');

    expect(publisher.disconnect).toHaveBeenCalledTimes(1);
    expect(subscriber.disconnect).toHaveBeenCalledTimes(1);
    expect(internals.redisPublisher).toBeUndefined();
    expect(internals.redisSubscriber).toBeUndefined();
    expect(internals.adapterLifecycleState).toBe('unavailable');
    expect(recovery).toHaveBeenCalledTimes(1);

    publisherPing.resolve('PONG');
    subscriberPing.reject(new Error('late half-open failure'));
    await flushPromises();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('single-flights adapter recovery across repeated readiness checks', async () => {
    const recovery = deferred<boolean>();
    const publisher = redisClient();
    const subscriber = redisClient();
    const gateway = createGateway();
    const internals = gatewayInternals(gateway, publisher, subscriber);
    internals.adapterLifecycleState = 'unavailable';
    internals.server = { sockets: new Map() };
    const configure = jest
      .spyOn(internals, 'configureRedisAdapter')
      .mockImplementation(() =>
        recovery.promise.then((ready) => {
          if (ready) internals.adapterLifecycleState = 'ready';
          return ready;
        }),
      );

    const first = gateway.checkReadiness();
    const second = gateway.checkReadiness();
    await flushPromises();
    expect(configure).toHaveBeenCalledTimes(1);

    recovery.resolve(true);
    await expect(Promise.all([first, second])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(publisher.ping).not.toHaveBeenCalled();
    expect(subscriber.ping).not.toHaveBeenCalled();
  });

  it('forces one disconnect when quit hangs and clears every close timer', async () => {
    const quit = deferred<string>();
    const client = redisClient({
      quit: jest.fn().mockReturnValue(quit.promise),
    });
    const internals = gatewayInternals(createGateway());

    const first = internals.closeRedisClient(client as unknown as IORedis);
    const second = internals.closeRedisClient(client as unknown as IORedis);
    expect(second).toBe(first);

    jest.advanceTimersByTime(400);
    await expect(first).resolves.toBeUndefined();
    expect(client.quit).toHaveBeenCalledTimes(1);
    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);

    quit.reject(new Error('late quit failure'));
    await flushPromises();
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });

  it('configures both adapter clients with Realtime TLS and fixed command bounds', async () => {
    jest.useRealTimers();
    const realtimeCaPem = rootCertificates[1];
    const subscriber = redisClient();
    const publisher = redisClient({
      duplicate: jest.fn(() => subscriber),
    });
    MockedIORedis.mockImplementation(
      () => publisher as unknown as IORedis,
    );
    const configGet = jest.fn((key: string) => {
      if (key === 'NODE_ENV') return 'production';
      if (key === 'REALTIME_REDIS_URL') {
        return 'rediss://realtime-cache.invalid:6379';
      }
      if (key === 'REALTIME_REDIS_TLS_CA_PEM') return realtimeCaPem;
      return undefined;
    });
    const gateway = createGateway(undefined, configGet);
    const internals = gatewayInternals(gateway);
    const server = {
      adapter: jest.fn(),
      disconnectSockets: jest.fn(),
      sockets: {
        sockets: new Map(),
      },
    };
    internals.server = server;

    await expect(
      internals.configureRedisAdapter(server),
    ).resolves.toBe(true);

    expect(MockedIORedis).toHaveBeenCalledWith(
      'rediss://realtime-cache.invalid:6379',
      expect.objectContaining({
        lazyConnect: true,
        maxRetriesPerRequest: 0,
        enableOfflineQueue: false,
        autoResendUnfulfilledCommands: false,
        connectTimeout: 400,
        commandTimeout: 400,
        tls: {
          ca: [realtimeCaPem],
          rejectUnauthorized: true,
        },
      }),
    );
    expect(publisher.duplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        lazyConnect: true,
        maxRetriesPerRequest: 0,
        enableOfflineQueue: false,
        autoResendUnfulfilledCommands: false,
        connectTimeout: 400,
        commandTimeout: 400,
        tls: {
          ca: [realtimeCaPem],
          rejectUnauthorized: true,
        },
      }),
    );
    expect(publisher.connect).toHaveBeenCalledTimes(1);
    expect(subscriber.connect).toHaveBeenCalledTimes(1);
    expect(publisher.ping).toHaveBeenCalledTimes(1);
    expect(subscriber.ping).toHaveBeenCalledTimes(1);
    expect(configGet).toHaveBeenCalledWith('REALTIME_REDIS_URL');
    expect(configGet).toHaveBeenCalledWith('REALTIME_REDIS_TLS_CA_PEM');
    expect(configGet).not.toHaveBeenCalledWith('QUEUE_REDIS_TLS_CA_PEM');
    expect(configGet).not.toHaveBeenCalledWith('REDIS_URL');

    await gateway.onModuleDestroy();
    expect(publisher.quit).toHaveBeenCalledTimes(1);
    expect(subscriber.quit).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, 'malformed-ca'])(
    'keeps a strict missing or malformed Realtime CA unavailable without constructing clients',
    async (realtimeCaPem) => {
      const configGet = jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'staging';
        if (key === 'REALTIME_REDIS_URL') {
          return 'rediss://realtime-cache.invalid:6379';
        }
        if (key === 'REALTIME_REDIS_TLS_CA_PEM') return realtimeCaPem;
        return undefined;
      });
      const internals = gatewayInternals(createGateway(undefined, configGet));
      const server = {
        adapter: jest.fn(),
        disconnectSockets: jest.fn(),
        sockets: { sockets: new Map() },
      };
      internals.server = server;

      await expect(
        internals.configureRedisAdapter(server),
      ).resolves.toBe(false);
      expect(MockedIORedis).not.toHaveBeenCalled();
      expect(internals.redisPublisher).toBeUndefined();
      expect(internals.redisSubscriber).toBeUndefined();
    },
  );
});

function createGateway(
  redisUrl?: string,
  configGet = jest.fn((key: string) =>
    key === 'REALTIME_REDIS_URL' ? redisUrl : undefined,
  ),
): RealtimeGateway {
  return new RealtimeGateway(
    {} as RealtimeAuthService,
    {} as RealtimeCommunicationAccessService,
    {} as RealtimePublisherService,
    {
      get: configGet,
    } as unknown as ConfigService<Env, true>,
    {} as RealtimePresenceService,
    {} as RealtimeTypingService,
  );
}

function gatewayInternals(
  gateway: RealtimeGateway,
  publisher?: RedisClientDouble,
  subscriber?: RedisClientDouble,
): RealtimeGatewayInternals {
  const internals = gateway as unknown as RealtimeGatewayInternals;
  internals.redisPublisher = publisher as unknown as IORedis;
  internals.redisSubscriber = subscriber as unknown as IORedis;
  return internals;
}

function redisClient(
  overrides: Partial<RedisClientDouble> = {},
): RedisClientDouble {
  return {
    status: 'ready',
    connect: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn(),
    duplicate: jest.fn(),
    on: jest.fn(),
    ...overrides,
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
