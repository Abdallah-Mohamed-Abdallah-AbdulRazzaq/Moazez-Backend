import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import type { Env } from '../../../config/env.validation';
import { RealtimeStateStoreService } from '../realtime-state-store.service';

jest.mock('ioredis');

type RedisTransactionDouble = {
  set: jest.Mock;
  sadd: jest.Mock;
  expire: jest.Mock;
  del: jest.Mock;
  srem: jest.Mock;
  exec: jest.Mock<Promise<Array<[Error | null, unknown]> | null>, []>;
};

type RedisPipelineDouble = {
  get: jest.Mock;
  ttl: jest.Mock;
  exec: jest.Mock<Promise<Array<[Error | null, unknown]> | null>, []>;
};

type RedisDouble = {
  status: string;
  connect: jest.Mock<Promise<void>, []>;
  disconnect: jest.Mock<void, []>;
  eval: jest.Mock<Promise<unknown>, unknown[]>;
  on: jest.Mock<RedisDouble, [string, () => void]>;
  ping: jest.Mock<Promise<string>, []>;
  quit: jest.Mock<Promise<string>, []>;
  multi: jest.Mock<RedisTransactionDouble, []>;
  pipeline: jest.Mock<RedisPipelineDouble, []>;
  smembers: jest.Mock<Promise<string[]>, [string]>;
  srem: jest.Mock<Promise<number>, [string, ...string[]]>;
};

const MockedIORedis = jest.mocked(IORedis);

describe('RealtimeStateStoreService recovery lifecycle', () => {
  let clients: RedisDouble[];
  let nextClientFactory: () => RedisDouble;
  let loggerWarn: jest.SpyInstance;

  beforeEach(() => {
    clients = [];
    nextClientFactory = () => createRedisDouble();
    MockedIORedis.mockImplementation(() => {
      const client = nextClientFactory();
      clients.push(client);
      return client as unknown as IORedis;
    });
    loggerWarn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('single-flights initial connection and reports healthy readiness', async () => {
    const connection = deferred<void>();
    nextClientFactory = () =>
      createRedisDouble({
        connect: jest.fn(() =>
          connection.promise.then(() => {
            clients[0].status = 'ready';
          }),
        ),
      });
    const service = createService();

    const first = service.checkReadiness();
    const second = service.checkReadiness();
    await Promise.resolve();

    expect(MockedIORedis).toHaveBeenCalledTimes(1);
    expect(MockedIORedis).toHaveBeenCalledWith(
      'redis://state-user:state-secret@internal:6379',
      expect.objectContaining({
        lazyConnect: true,
        maxRetriesPerRequest: 0,
        enableOfflineQueue: false,
        autoResendUnfulfilledCommands: false,
        connectTimeout: 1000,
        commandTimeout: 1000,
      }),
    );
    expect(clients[0].connect).toHaveBeenCalledTimes(1);
    connection.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(clients[0].ping).toHaveBeenCalledTimes(2);

    await service.onModuleDestroy();
    expect(clients[0].quit).toHaveBeenCalledTimes(1);
  });

  it('retires a half-open owned client before the probe caller deadline and recovers with a fresh client', async () => {
    jest.useFakeTimers();
    const halfOpenPing = deferred<string>();
    const unhandledRejection = jest.fn();
    process.on('unhandledRejection', unhandledRejection);

    try {
      const service = createService();
      await service.checkReadiness();
      const retiredClient = clients[0];
      retiredClient.ping.mockImplementationOnce(() => halfOpenPing.promise);

      const outage = service.checkReadiness();
      await flushPromises();
      jest.advanceTimersByTime(600);

      await expect(outage).rejects.toThrow(
        'realtime_state_redis_unavailable',
      );
      expect(retiredClient.disconnect).toHaveBeenCalledTimes(1);
      expect(retiredClient.quit).not.toHaveBeenCalled();
      expect(stateStoreInternals(service).redis).toBeUndefined();
      expect(stateStoreInternals(service).lifecycleState).not.toBe('ready');

      nextClientFactory = () => createRedisDouble();
      await expect(service.checkReadiness()).resolves.toBeUndefined();
      expect(clients).toHaveLength(2);
      expect(stateStoreInternals(service).redis).toBe(clients[1]);
      expect(stateStoreInternals(service).lifecycleState).toBe('ready');

      halfOpenPing.reject(new Error('late half-open Redis rejection'));
      await flushPromises();
      expect(unhandledRejection).not.toHaveBeenCalled();
      expect(retiredClient.disconnect).toHaveBeenCalledTimes(1);
      expect(stateStoreInternals(service).redis).toBe(clients[1]);

      await service.onModuleDestroy();
    } finally {
      process.off('unhandledRejection', unhandledRejection);
    }
  });

  it('reconciles fallback presence before readiness recovers', async () => {
    let attempt = 0;
    nextClientFactory = () => {
      attempt += 1;
      return createRedisDouble(
        attempt === 1
          ? {
              eval: jest
                .fn()
                .mockRejectedValue(new Error('operation unavailable')),
            }
          : undefined,
      );
    };
    const service = createService();

    await expect(
      service.incrementPresence('school-1', 'user-1', 'socket-1', 30),
    ).resolves.toMatchObject({
      socketCount: 1,
      transitionedOnline: true,
    });
    await waitForMockCall(clients[0].disconnect);
    expect(clients[0].quit).not.toHaveBeenCalled();
    expect(clients[0].disconnect).toHaveBeenCalledTimes(1);

    await expect(service.checkReadiness()).resolves.toBeUndefined();
    expect(MockedIORedis).toHaveBeenCalledTimes(2);
    expect(clients[1].eval).toHaveBeenCalledWith(
      expect.any(String),
      3,
      expect.stringContaining('school:school-1:user:user-1:sockets'),
      expect.stringContaining('school:school-1:user:user-1'),
      expect.stringContaining('school:school-1:users'),
      'socket-1',
      expect.any(String),
      '30',
      '90',
      'user-1',
    );
  });

  it('replays multi-socket presence oldest first so the shared timestamp stays newest', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-29T10:01:00.000Z'));
    let attempt = 0;
    nextClientFactory = () => {
      attempt += 1;
      return createRedisDouble(
        attempt <= 2
          ? {
              eval: jest
                .fn()
                .mockRejectedValue(new Error('operation unavailable')),
            }
          : undefined,
      );
    };
    const service = createService();

    await service.incrementPresence('school-1', 'user-1', 'socket-new', 30);
    jest.setSystemTime(new Date('2026-07-29T10:00:00.000Z'));
    await service.incrementPresence('school-1', 'user-1', 'socket-old', 30);

    await expect(service.checkReadiness()).resolves.toBeUndefined();

    expect(clients[2].eval).toHaveBeenCalledTimes(2);
    expect(clients[2].eval.mock.calls[0][5]).toBe('socket-old');
    expect(clients[2].eval.mock.calls[1][5]).toBe('socket-new');
    expect(
      String(clients[2].eval.mock.calls[1][6]).localeCompare(
        String(clients[2].eval.mock.calls[0][6]),
      ),
    ).toBeGreaterThan(0);

    await service.onModuleDestroy();
  });

  it('keeps readiness unavailable after failed reconciliation and retries safely', async () => {
    let attempt = 0;
    nextClientFactory = () => {
      attempt += 1;
      return createRedisDouble(
        attempt <= 2
          ? {
              eval: jest
                .fn()
                .mockRejectedValue(new Error('redis unavailable')),
            }
          : undefined,
      );
    };
    const service = createService();

    await service.incrementPresence('school-1', 'user-1', 'socket-1', 30);
    await expect(service.checkReadiness()).rejects.toThrow(
      'realtime_state_redis_unavailable',
    );
    await expect(service.checkReadiness()).resolves.toBeUndefined();

    expect(MockedIORedis).toHaveBeenCalledTimes(3);
    expect(clients[1].quit).toHaveBeenCalledTimes(1);
    expect(clients[2].eval).toHaveBeenCalledTimes(1);
  });

  it('reconciles only unexpired typing with the remaining TTL', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-29T10:00:00.000Z'));
    let attempt = 0;
    nextClientFactory = () => {
      attempt += 1;
      return createRedisDouble(
        attempt === 1
          ? {
              multi: jest.fn(() =>
                createTransactionDouble({
                  exec: jest
                    .fn()
                    .mockRejectedValue(new Error('operation unavailable')),
                }),
              ),
            }
          : undefined,
      );
    };
    const service = createService();

    await service.setTyping('school-1', 'conversation-1', 'user-1', 8);
    jest.advanceTimersByTime(3_100);
    await expect(service.checkReadiness()).resolves.toBeUndefined();

    const recoveredTransaction = clients[1].multi.mock.results[0]
      .value as RedisTransactionDouble;
    expect(recoveredTransaction.set).toHaveBeenCalledWith(
      expect.stringContaining('conversation:conversation-1:user:user-1'),
      '2026-07-29T10:00:00.000Z',
      'EX',
      5,
    );

    await service.onModuleDestroy();
  });

  it('does not resurrect expired fallback typing', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-29T10:00:00.000Z'));
    let attempt = 0;
    nextClientFactory = () => {
      attempt += 1;
      return createRedisDouble(
        attempt === 1
          ? {
              multi: jest.fn(() =>
                createTransactionDouble({
                  exec: jest
                    .fn()
                    .mockRejectedValue(new Error('operation unavailable')),
                }),
              ),
            }
          : undefined,
      );
    };
    const service = createService();

    await service.setTyping('school-1', 'conversation-1', 'user-1', 1);
    jest.advanceTimersByTime(1_100);
    await expect(service.checkReadiness()).resolves.toBeUndefined();

    expect(clients[1].multi).not.toHaveBeenCalled();
    await expect(
      service.getTypingUsers('school-1', 'conversation-1'),
    ).resolves.toEqual([]);
    await service.onModuleDestroy();
  });

  it('reconciles shorter typing TTLs first so the shared index keeps the longest active TTL', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-29T10:00:00.000Z'));
    let attempt = 0;
    nextClientFactory = () => {
      attempt += 1;
      return createRedisDouble(
        attempt <= 3
          ? {
              multi: jest.fn(() =>
                createTransactionDouble({
                  exec: jest
                    .fn()
                    .mockRejectedValue(new Error('operation unavailable')),
                }),
              ),
            }
          : undefined,
      );
    };
    const service = createService();

    await service.setTyping('school-1', 'conversation-1', 'user-a', 10);
    jest.advanceTimersByTime(3_000);
    await service.setTyping('school-1', 'conversation-1', 'user-b', 10);
    jest.advanceTimersByTime(1_000);
    await service.setTyping('school-1', 'conversation-1', 'user-a', 10);

    await expect(service.checkReadiness()).resolves.toBeUndefined();

    const recoveredTransactions = clients[3].multi.mock.results.map(
      (result) => result.value as RedisTransactionDouble,
    );
    expect(recoveredTransactions).toHaveLength(2);
    expect(recoveredTransactions[0].set).toHaveBeenCalledWith(
      expect.stringContaining('user:user-b'),
      expect.any(String),
      'EX',
      9,
    );
    expect(recoveredTransactions[0].expire).toHaveBeenCalledWith(
      expect.stringContaining('conversation:conversation-1:users'),
      9,
    );
    expect(recoveredTransactions[1].set).toHaveBeenCalledWith(
      expect.stringContaining('user:user-a'),
      expect.any(String),
      'EX',
      10,
    );
    expect(recoveredTransactions[1].expire).toHaveBeenCalledWith(
      expect.stringContaining('conversation:conversation-1:users'),
      10,
    );
    await service.onModuleDestroy();
  });

  it('waits for owned recovery before closing exactly once during destroy', async () => {
    const connection = deferred<void>();
    nextClientFactory = () =>
      createRedisDouble({
        connect: jest.fn(() =>
          connection.promise.then(() => {
            clients[0].status = 'ready';
          }),
        ),
      });
    const service = createService();
    const readiness = service.checkReadiness();
    await Promise.resolve();

    const firstDestroy = service.onModuleDestroy();
    const secondDestroy = service.onModuleDestroy();
    expect(firstDestroy).toBe(secondDestroy);
    connection.resolve();

    await expect(readiness).rejects.toThrow(
      'realtime_state_redis_unavailable',
    );
    await expect(firstDestroy).resolves.toBeUndefined();
    expect(clients[0].quit).toHaveBeenCalledTimes(1);
  });

  it('keeps shutdown bounded and owned while fallback reconciliation is active', async () => {
    const reconciliation = deferred<unknown>();
    let attempt = 0;
    nextClientFactory = () => {
      attempt += 1;
      return createRedisDouble(
        attempt === 1
          ? {
              eval: jest
                .fn()
                .mockRejectedValue(new Error('operation unavailable')),
            }
          : {
              eval: jest.fn().mockReturnValue(reconciliation.promise),
            },
      );
    };
    const service = createService();
    await service.incrementPresence('school-1', 'user-1', 'socket-1', 30);

    const readiness = service.checkReadiness();
    await flushPromises();
    const shutdown = service.onModuleDestroy();
    let shutdownSettled = false;
    void shutdown.then(() => {
      shutdownSettled = true;
    });
    await flushPromises();
    expect(shutdownSettled).toBe(false);

    reconciliation.resolve([1, 1]);
    await expect(readiness).rejects.toThrow(
      'realtime_state_redis_unavailable',
    );
    await expect(shutdown).resolves.toBeUndefined();
    expect(clients[1].quit).toHaveBeenCalledTimes(1);
  });

  it('serializes disconnect after reconciliation without resurrecting local ownership', async () => {
    const reconciliation = deferred<unknown>();
    let attempt = 0;
    nextClientFactory = () => {
      attempt += 1;
      return createRedisDouble(
        attempt === 1
          ? {
              eval: jest
                .fn()
                .mockRejectedValue(new Error('operation unavailable')),
            }
          : {
              eval: jest
                .fn()
                .mockReturnValueOnce(reconciliation.promise)
                .mockResolvedValueOnce([0, 1]),
            },
      );
    };
    const service = createService();
    await service.incrementPresence('school-1', 'user-1', 'socket-1', 30);

    const readiness = service.checkReadiness();
    await flushPromises();
    const disconnect = service.decrementPresence(
      'school-1',
      'user-1',
      'socket-1',
      30,
    );
    reconciliation.resolve([1, 1]);

    await expect(readiness).resolves.toBeUndefined();
    await expect(disconnect).resolves.toMatchObject({
      socketCount: 0,
      transitionedOffline: true,
    });
    await expect(service.getPresenceSnapshot('school-1')).resolves.toEqual([]);
    expect(clients[1].eval).toHaveBeenCalledTimes(2);
    await service.onModuleDestroy();
  });

  it('bounds a hanging old-client QUIT before recovery becomes ready', async () => {
    jest.useFakeTimers();
    const oldQuit = deferred<string>();
    const service = createService();

    await service.checkReadiness();
    const oldClient = clients[0];
    oldClient.status = 'reconnecting';
    oldClient.quit.mockImplementation(() => oldQuit.promise);

    const recovery = service.checkReadiness();
    await waitForMockCall(oldClient.quit);
    expect(clients).toHaveLength(2);
    expect(oldClient.quit).toHaveBeenCalledTimes(1);

    let settled = false;
    void recovery.then(() => {
      settled = true;
    });
    await flushPromises();
    expect(settled).toBe(false);

    jest.advanceTimersByTime(1_000);
    await expect(recovery).resolves.toBeUndefined();
    expect(oldClient.disconnect).toHaveBeenCalledTimes(1);
    expect(stateStoreInternals(service).redis).toBe(clients[1]);
    expect(stateStoreInternals(service).lifecycleState).toBe('ready');
    await expect(service.checkReadiness()).resolves.toBeUndefined();

    await service.onModuleDestroy();
  });

  it('observes a late old-client QUIT rejection after bounded recovery', async () => {
    jest.useFakeTimers();
    const oldQuit = deferred<string>();
    const unhandledRejection = jest.fn();
    process.on('unhandledRejection', unhandledRejection);

    try {
      const service = createService();
      await service.checkReadiness();
      const oldClient = clients[0];
      oldClient.status = 'reconnecting';
      oldClient.quit.mockImplementation(() => oldQuit.promise);

      const recovery = service.checkReadiness();
      await waitForMockCall(oldClient.quit);
      jest.advanceTimersByTime(1_000);
      await expect(recovery).resolves.toBeUndefined();

      oldQuit.reject(new Error('late redis://sensitive.invalid/private'));
      await flushPromises();
      expect(unhandledRejection).not.toHaveBeenCalled();
      expect(oldClient.disconnect).toHaveBeenCalledTimes(1);
      await expect(service.checkReadiness()).resolves.toBeUndefined();

      await service.onModuleDestroy();
    } finally {
      process.off('unhandledRejection', unhandledRejection);
    }
  });

  it('rejects a recovery candidate that becomes unavailable while old-client QUIT is pending', async () => {
    jest.useFakeTimers();
    const oldQuit = deferred<string>();
    const unhandledRejection = jest.fn();
    process.on('unhandledRejection', unhandledRejection);

    try {
      const service = createService();
      await service.checkReadiness();
      const oldClient = clients[0];
      oldClient.status = 'reconnecting';
      oldClient.quit.mockImplementation(() => oldQuit.promise);

      const recovery = service.checkReadiness();
      await waitForMockCall(oldClient.quit);
      const candidate = clients[1];
      expect(candidate.ping).toHaveBeenCalledTimes(1);

      candidate.status = 'reconnecting';
      jest.advanceTimersByTime(1_000);

      await expect(recovery).rejects.toThrow(
        'realtime_state_redis_unavailable',
      );
      await flushPromises();
      expect(stateStoreInternals(service).lifecycleState).not.toBe('ready');
      expect(oldClient.quit).toHaveBeenCalledTimes(1);
      expect(oldClient.disconnect).toHaveBeenCalledTimes(1);
      expect(candidate.quit).toHaveBeenCalledTimes(1);
      expect(candidate.disconnect).not.toHaveBeenCalled();
      expect(unhandledRejection).not.toHaveBeenCalled();

      await service.onModuleDestroy();
    } finally {
      process.off('unhandledRejection', unhandledRejection);
    }
  });

  it('keeps recovery unavailable when the final candidate ping fails and permits a later retry', async () => {
    const service = createService();
    await service.checkReadiness();
    const oldClient = clients[0];
    oldClient.status = 'reconnecting';
    nextClientFactory = () =>
      createRedisDouble({
        ping: jest
          .fn()
          .mockResolvedValueOnce('PONG')
          .mockRejectedValueOnce(new Error('candidate became unavailable')),
      });

    await expect(service.checkReadiness()).rejects.toThrow(
      'realtime_state_redis_unavailable',
    );

    const failedCandidate = clients[1];
    expect(failedCandidate.ping).toHaveBeenCalledTimes(2);
    expect(failedCandidate.quit).toHaveBeenCalledTimes(1);
    expect(stateStoreInternals(service).lifecycleState).not.toBe('ready');

    nextClientFactory = () => createRedisDouble();
    await expect(service.checkReadiness()).resolves.toBeUndefined();
    expect(clients).toHaveLength(3);
    expect(clients[2].ping).toHaveBeenCalledTimes(2);
    expect(stateStoreInternals(service).redis).toBe(clients[2]);
    expect(stateStoreInternals(service).lifecycleState).toBe('ready');
    await expect(service.checkReadiness()).resolves.toBeUndefined();

    await service.onModuleDestroy();
  });

  it('cannot publish ready when destruction begins during final candidate validation', async () => {
    const finalPing = deferred<string>();
    const service = createService();
    await service.checkReadiness();
    const oldClient = clients[0];
    oldClient.status = 'reconnecting';
    nextClientFactory = () =>
      createRedisDouble({
        ping: jest
          .fn()
          .mockResolvedValueOnce('PONG')
          .mockImplementationOnce(() => finalPing.promise),
      });

    const recovery = service.checkReadiness();
    const candidate = clients[1];
    await waitForMockCallCount(candidate.ping, 2);

    const shutdown = service.onModuleDestroy();
    expect(stateStoreInternals(service).lifecycleState).toBe('destroying');
    finalPing.resolve('PONG');

    await expect(recovery).rejects.toThrow(
      'realtime_state_redis_unavailable',
    );
    await expect(shutdown).resolves.toBeUndefined();
    expect(stateStoreInternals(service).lifecycleState).toBe('destroying');
    expect(stateStoreInternals(service).redis).toBeUndefined();
    expect(candidate.quit).toHaveBeenCalledTimes(1);
    expect(candidate.disconnect).not.toHaveBeenCalled();
    expect(oldClient.quit).toHaveBeenCalledTimes(1);
  });

  it('revalidates the owned candidate after retiring the previous client before publishing ready', async () => {
    const order: string[] = [];
    const service = createService();
    await service.checkReadiness();
    await service.incrementPresence(
      'school-1',
      'user-1',
      'socket-1',
      30,
    );
    const oldClient = clients[0];
    oldClient.status = 'reconnecting';
    oldClient.quit.mockImplementation(async () => {
      order.push('previous-retired');
      oldClient.status = 'end';
      return 'OK';
    });

    nextClientFactory = () => {
      const candidate = createRedisDouble();
      let pingCount = 0;
      candidate.ping.mockImplementation(async () => {
        pingCount += 1;
        order.push(pingCount === 1 ? 'initial-ping' : 'final-ping');
        return 'PONG';
      });
      candidate.eval.mockImplementation(async () => {
        order.push('reconciliation');
        return [1, 1];
      });
      return candidate;
    };

    await expect(service.checkReadiness()).resolves.toBeUndefined();
    const candidate = clients[1];
    expect(order).toEqual([
      'initial-ping',
      'reconciliation',
      'previous-retired',
      'final-ping',
    ]);
    expect(candidate.ping).toHaveBeenCalledTimes(2);
    expect(stateStoreInternals(service).redis).toBe(candidate);
    expect(stateStoreInternals(service).lifecycleState).toBe('ready');

    await expect(service.checkReadiness()).resolves.toBeUndefined();
    expect(candidate.ping).toHaveBeenCalledTimes(3);
    await service.onModuleDestroy();
  });

  it('does not downgrade or close a newer owned client when candidate revalidation loses ownership', async () => {
    const finalPing = deferred<string>();
    const service = createService();
    await service.checkReadiness();
    const oldClient = clients[0];
    oldClient.status = 'reconnecting';
    nextClientFactory = () =>
      createRedisDouble({
        ping: jest
          .fn()
          .mockResolvedValueOnce('PONG')
          .mockImplementationOnce(() => finalPing.promise),
      });

    const recovery = service.checkReadiness();
    const failedCandidate = clients[1];
    await waitForMockCallCount(failedCandidate.ping, 2);

    const newerClient = createRedisDouble({ status: 'ready' });
    const internals = stateStoreInternals(service);
    internals.redis = newerClient;
    internals.lifecycleState = 'ready';
    finalPing.resolve('PONG');

    await expect(recovery).rejects.toThrow(
      'realtime_state_redis_unavailable',
    );
    expect(internals.redis).toBe(newerClient);
    expect(internals.lifecycleState).toBe('ready');
    expect(newerClient.quit).not.toHaveBeenCalled();
    expect(newerClient.disconnect).not.toHaveBeenCalled();
    await expect(service.checkReadiness()).resolves.toBeUndefined();

    await service.onModuleDestroy();
    expect(newerClient.quit).toHaveBeenCalledTimes(1);
  });

  it('does not let a late retired-client failure downgrade the recovered client', async () => {
    const stalePing = deferred<string>();
    const service = createService();
    await service.checkReadiness();
    const oldClient = clients[0];
    oldClient.ping.mockImplementationOnce(() => stalePing.promise);
    oldClient.eval.mockRejectedValueOnce(new Error('redis unavailable'));

    const staleReadiness = service.checkReadiness();
    await service.incrementPresence('school-1', 'user-1', 'socket-1', 30);
    await expect(service.checkReadiness()).resolves.toBeUndefined();
    const recoveredClient = clients[1];

    stalePing.reject(new Error('late retired client failure'));
    await expect(staleReadiness).rejects.toThrow(
      'realtime_state_redis_unavailable',
    );
    expect(stateStoreInternals(service).redis).toBe(recoveredClient);
    expect(stateStoreInternals(service).lifecycleState).toBe('ready');
    expect(recoveredClient.quit).not.toHaveBeenCalled();
    expect(recoveredClient.disconnect).not.toHaveBeenCalled();
    await expect(service.checkReadiness()).resolves.toBeUndefined();

    await service.onModuleDestroy();
  });

  it('clears the close deadline when the old client quits gracefully', async () => {
    jest.useFakeTimers();
    const service = createService();
    await service.checkReadiness();
    const baselineTimers = jest.getTimerCount();
    const oldClient = clients[0];
    oldClient.status = 'reconnecting';

    await expect(service.checkReadiness()).resolves.toBeUndefined();

    expect(oldClient.quit).toHaveBeenCalledTimes(1);
    expect(oldClient.disconnect).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(baselineTimers);
    await service.onModuleDestroy();
  });

  it('forces one disconnect when graceful old-client QUIT rejects', async () => {
    const rawFailure = 'redis://sensitive.invalid/private';
    const service = createService();
    await service.checkReadiness();
    const oldClient = clients[0];
    oldClient.status = 'reconnecting';
    oldClient.quit.mockRejectedValue(new Error(rawFailure));

    await expect(service.checkReadiness()).resolves.toBeUndefined();

    expect(oldClient.quit).toHaveBeenCalledTimes(1);
    expect(oldClient.disconnect).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(loggerWarn.mock.calls)).not.toContain(rawFailure);
    await service.onModuleDestroy();
  });

  it('single-owns concurrent close requests for the same Redis client', async () => {
    jest.useFakeTimers();
    const service = createService();
    const closeTarget = createRedisDouble({ status: 'reconnecting' });
    const hangingQuit = deferred<string>();
    closeTarget.quit.mockImplementation(() => hangingQuit.promise);
    const internals = stateStoreInternals(service);
    const baselineTimers = jest.getTimerCount();

    const first = internals.closeRedisClient(closeTarget as unknown as IORedis);
    const second = internals.closeRedisClient(
      closeTarget as unknown as IORedis,
    );

    expect(first).toBe(second);
    await flushPromises();
    expect(closeTarget.quit).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1_000);
    await expect(Promise.all([first, second])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(closeTarget.disconnect).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(baselineTimers);
    await service.onModuleDestroy();
  });

  it('cannot transition from destroying back to ready during replacement', async () => {
    jest.useFakeTimers();
    const oldQuit = deferred<string>();
    const service = createService();
    await service.checkReadiness();
    const oldClient = clients[0];
    oldClient.status = 'reconnecting';
    oldClient.quit.mockImplementation(() => oldQuit.promise);

    const recovery = service.checkReadiness();
    await waitForMockCall(oldClient.quit);
    expect(clients).toHaveLength(2);
    expect(oldClient.quit).toHaveBeenCalledTimes(1);

    const shutdown = service.onModuleDestroy();
    expect(stateStoreInternals(service).lifecycleState).toBe('destroying');
    jest.advanceTimersByTime(1_000);

    await expect(recovery).rejects.toThrow('realtime_state_redis_unavailable');
    await expect(shutdown).resolves.toBeUndefined();
    expect(stateStoreInternals(service).lifecycleState).toBe('destroying');
    expect(stateStoreInternals(service).redis).toBeUndefined();
    expect(oldClient.quit).toHaveBeenCalledTimes(1);
    expect(oldClient.disconnect).toHaveBeenCalledTimes(1);
    expect(clients[1].quit).toHaveBeenCalledTimes(1);
    expect(clients[1].disconnect).not.toHaveBeenCalled();
  });

  it('closes a failed candidate and permits one later recovery', async () => {
    const service = createService();
    await service.checkReadiness();
    const oldClient = clients[0];
    oldClient.status = 'reconnecting';
    nextClientFactory = () =>
      createRedisDouble({
        connect: jest
          .fn()
          .mockRejectedValue(new Error('candidate unavailable')),
      });

    await expect(service.checkReadiness()).rejects.toThrow(
      'realtime_state_redis_unavailable',
    );

    const failedCandidate = clients[1];
    expect(failedCandidate.disconnect).toHaveBeenCalledTimes(1);
    expect(oldClient.quit).toHaveBeenCalledTimes(1);
    expect(stateStoreInternals(service).redis).toBeUndefined();

    nextClientFactory = () => createRedisDouble();
    await expect(service.checkReadiness()).resolves.toBeUndefined();
    expect(clients).toHaveLength(3);
    expect(stateStoreInternals(service).redis).toBe(clients[2]);
    expect(stateStoreInternals(service).lifecycleState).toBe('ready');
    await service.onModuleDestroy();
  });

  it('never logs a Redis URL or raw failure payload', async () => {
    nextClientFactory = () =>
      createRedisDouble({
        connect: jest
          .fn()
          .mockRejectedValue(
            new Error('redis://state-user:state-secret@internal'),
          ),
      });
    const service = createService();

    await expect(service.checkReadiness()).rejects.toThrow(
      'realtime_state_redis_unavailable',
    );
    const serialized = JSON.stringify(loggerWarn.mock.calls);
    expect(serialized).not.toContain(
      'redis://state-user:state-secret@internal',
    );
    expect(serialized).toContain('realtime.state_store.unavailable');
  });

  it('sweeps expired typing ownership while Redis remains healthy without a read', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-29T10:00:00.000Z'));
    const service = createService();
    const internals = stateStoreInternals(service);

    await service.setTyping('school-expired', 'conversation-expired', 'user-expired', 1);
    await service.setTyping('school-active', 'conversation-active', 'user-active', 10);

    expect(typingMemoryUsage(internals.localTyping)).toEqual({
      schools: 2,
      conversations: 2,
      owners: 2,
    });

    jest.advanceTimersByTime(4_000);
    await flushPromises();

    expect(typingMemoryUsage(internals.localTyping)).toEqual({
      schools: 1,
      conversations: 1,
      owners: 1,
    });
    expect(internals.localTyping.has('school-expired')).toBe(false);
    expect(internals.localTyping.has('school-active')).toBe(true);
    await service.onModuleDestroy();
  });

  it('removes many expired typing owners and empty nested maps with one unrefed sweep timer', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-29T10:00:00.000Z'));
    const service = createService();
    const internals = stateStoreInternals(service);

    for (let schoolIndex = 0; schoolIndex < 20; schoolIndex += 1) {
      for (let conversationIndex = 0; conversationIndex < 5; conversationIndex += 1) {
        await service.setTyping(
          `school-${schoolIndex}`,
          `conversation-${conversationIndex}`,
          `user-${schoolIndex}-${conversationIndex}`,
          1,
        );
      }
    }

    expect(internals.localTypingSweepTimer.hasRef()).toBe(false);
    expect(typingMemoryUsage(internals.localTyping).owners).toBe(100);

    jest.advanceTimersByTime(4_000);
    await flushPromises();

    expect(typingMemoryUsage(internals.localTyping)).toEqual({
      schools: 0,
      conversations: 0,
      owners: 0,
    });
    await service.onModuleDestroy();
  });

  it('single-flights cleanup and serializes it behind active state mutation', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-29T10:00:00.000Z'));
    const service = createService();
    const internals = stateStoreInternals(service);
    const mutation = deferred<void>();
    const removeExpired = jest.spyOn(
      internals,
      'removeExpiredLocalTyping',
    );
    const activeMutation = internals.runSerialized(() => mutation.promise);

    const firstSweep = internals.runLocalTypingSweep();
    const secondSweep = internals.runLocalTypingSweep();

    expect(secondSweep).toBe(firstSweep);
    expect(removeExpired).not.toHaveBeenCalled();

    mutation.resolve();
    await activeMutation;
    await firstSweep;
    expect(removeExpired).toHaveBeenCalledTimes(1);
    await service.onModuleDestroy();
  });

  it('serializes cleanup after reconciliation without corrupting active typing state', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-29T10:00:00.000Z'));
    const reconciliation = deferred<Array<[Error | null, unknown]> | null>();
    let attempt = 0;
    nextClientFactory = () => {
      attempt += 1;
      return createRedisDouble(
        attempt === 1
          ? {
              multi: jest.fn(() =>
                createTransactionDouble({
                  exec: jest
                    .fn()
                    .mockRejectedValue(new Error('operation unavailable')),
                }),
              ),
            }
          : {
              multi: jest.fn(() =>
                createTransactionDouble({
                  exec: jest.fn().mockReturnValue(reconciliation.promise),
                }),
              ),
            },
      );
    };
    const service = createService();
    const internals = stateStoreInternals(service);

    await service.setTyping('school-1', 'conversation-1', 'user-1', 8);
    const readiness = service.checkReadiness();
    await flushPromises();

    jest.advanceTimersByTime(4_000);
    const activeSweep = internals.runLocalTypingSweep();
    let sweepSettled = false;
    void activeSweep.then(() => {
      sweepSettled = true;
    });
    await flushPromises();
    expect(sweepSettled).toBe(false);

    reconciliation.resolve([
      [null, 'OK'],
      [null, 1],
      [null, 1],
    ]);
    await readiness;
    await activeSweep;
    expect(typingMemoryUsage(internals.localTyping).owners).toBe(1);
    await service.onModuleDestroy();
  });

  it('clears its timer exactly once and awaits an active cleanup before closing Redis', async () => {
    jest.useFakeTimers();
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const service = createService();
    const internals = stateStoreInternals(service);
    await service.checkReadiness();
    const mutation = deferred<void>();
    const activeMutation = internals.runSerialized(() => mutation.promise);
    const sweep = internals.runLocalTypingSweep();

    const firstDestroy = service.onModuleDestroy();
    const secondDestroy = service.onModuleDestroy();
    expect(secondDestroy).toBe(firstDestroy);
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    let destroyed = false;
    void firstDestroy.then(() => {
      destroyed = true;
    });
    await flushPromises();
    expect(destroyed).toBe(false);

    mutation.resolve();
    await activeMutation;
    await sweep;
    await firstDestroy;
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(clients[0].quit).toHaveBeenCalledTimes(1);
  });

  it('moves the first local mutation after Redis failure into fallback state', async () => {
    const config = {
      get: jest.fn(() => undefined),
    } as unknown as ConfigService<Env, true>;
    const service = new RealtimeStateStoreService(config);
    const internals = stateStoreInternals(service);

    await service.setTyping('school-1', 'conversation-1', 'user-1', 8);

    expect(internals.lifecycleState).toBe('fallback');
    expect(typingMemoryUsage(internals.localTyping).owners).toBe(1);
    await service.onModuleDestroy();
  });

  function createService(): RealtimeStateStoreService {
    const config = {
      get: jest.fn(() => 'redis://state-user:state-secret@internal:6379'),
    } as unknown as ConfigService<Env, true>;
    return new RealtimeStateStoreService(config);
  }
});

type LocalTypingMemory = Map<
  string,
  Map<string, Map<string, { expiresAtMs: number }>>
>;

type RealtimeStateStoreInternals = {
  lifecycleState: string;
  redis?: RedisDouble;
  localTyping: LocalTypingMemory;
  localTypingSweepTimer: NodeJS.Timeout;
  closeRedisClient: (client?: IORedis) => Promise<void>;
  runLocalTypingSweep: () => Promise<void>;
  runSerialized: <T>(operation: () => Promise<T>) => Promise<T>;
  removeExpiredLocalTyping: () => void;
};

function stateStoreInternals(
  service: RealtimeStateStoreService,
): RealtimeStateStoreInternals {
  return service as unknown as RealtimeStateStoreInternals;
}

function typingMemoryUsage(localTyping: LocalTypingMemory): {
  schools: number;
  conversations: number;
  owners: number;
} {
  let conversations = 0;
  let owners = 0;
  for (const school of localTyping.values()) {
    conversations += school.size;
    for (const conversation of school.values()) owners += conversation.size;
  }
  return { schools: localTyping.size, conversations, owners };
}

function createRedisDouble(
  overrides: Partial<RedisDouble> = {},
): RedisDouble {
  const client: RedisDouble = {
    status: 'wait',
    connect: jest.fn(async () => {
      client.status = 'ready';
    }),
    disconnect: jest.fn(() => {
      client.status = 'end';
    }),
    eval: jest.fn().mockResolvedValue([1, 1]),
    on: jest.fn(),
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn(async () => {
      client.status = 'end';
      return 'OK';
    }),
    multi: jest.fn(() => createTransactionDouble()),
    pipeline: jest.fn(() => createPipelineDouble()),
    smembers: jest.fn().mockResolvedValue([]),
    srem: jest.fn().mockResolvedValue(0),
    ...overrides,
  };
  client.on.mockReturnValue(client);
  return client;
}

function createTransactionDouble(
  overrides: Partial<RedisTransactionDouble> = {},
): RedisTransactionDouble {
  const transaction = {
    set: jest.fn(),
    sadd: jest.fn(),
    expire: jest.fn(),
    del: jest.fn(),
    srem: jest.fn(),
    exec: jest.fn().mockResolvedValue([
      [null, 'OK'],
      [null, 1],
      [null, 1],
    ]),
    ...overrides,
  } as RedisTransactionDouble;
  transaction.set.mockReturnValue(transaction);
  transaction.sadd.mockReturnValue(transaction);
  transaction.expire.mockReturnValue(transaction);
  transaction.del.mockReturnValue(transaction);
  transaction.srem.mockReturnValue(transaction);
  return transaction;
}

function createPipelineDouble(): RedisPipelineDouble {
  const pipeline = {
    get: jest.fn(),
    ttl: jest.fn(),
    exec: jest.fn().mockResolvedValue([]),
  } as RedisPipelineDouble;
  pipeline.get.mockReturnValue(pipeline);
  pipeline.ttl.mockReturnValue(pipeline);
  return pipeline;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushPromises(turns = 64): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    await Promise.resolve();
  }
}

async function waitForMockCall(mock: jest.Mock): Promise<void> {
  await waitForMockCallCount(mock, 1);
}

async function waitForMockCallCount(
  mock: jest.Mock,
  expectedCount: number,
): Promise<void> {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    if (mock.mock.calls.length >= expectedCount) return;
    await flushPromises();
  }
  throw new Error(`Expected ${expectedCount} mock calls were not observed`);
}
