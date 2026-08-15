import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { rootCertificates } from 'node:tls';
import { BoundedProbeExecutor } from '../../modules/health/bounded-probe-executor';
import { BullmqService } from './bullmq.service';

jest.mock('bullmq');
jest.mock('ioredis');

type ErrorListener = (error: Error) => void;

type WorkerDouble = {
  name: string;
  blockingConnection: RedisConnectionDouble;
  connection: RedisConnectionDouble;
  closing: Promise<void> | undefined;
  stalledCheckStopper?: () => void;
  close: jest.Mock<Promise<void>, []>;
  run: jest.Mock<Promise<void>, []>;
  isPaused: jest.Mock<boolean, []>;
  isRunning: jest.Mock<boolean, []>;
  waitUntilReady: jest.Mock<Promise<unknown>, []>;
  on: jest.Mock<WorkerDouble, [string, ErrorListener]>;
  emitError: (error: Error) => void;
  emit: jest.Mock<boolean, [string, Error]>;
  rejectRun: (error: Error) => void;
  resolveRun: () => void;
};

type QueueDouble = {
  close: jest.Mock<Promise<void>, []>;
  connection: RedisConnectionDouble;
};

type RedisDouble = {
  status: string;
  connect: jest.Mock<Promise<void>, []>;
  ping: jest.Mock<Promise<string>, []>;
  quit: jest.Mock<Promise<string>, []>;
  disconnect: jest.Mock<void, []>;
  on: jest.Mock<RedisDouble, [string, ErrorListener]>;
  emitError: (error: Error) => void;
};

type RedisConnectionDouble = {
  initializing: Promise<unknown>;
  status: string;
  on: jest.Mock<RedisConnectionDouble, [string, ErrorListener]>;
  removeAllListeners: jest.Mock<RedisConnectionDouble, [string?]>;
  emitError: (error: Error) => void;
};

const MockedWorker = jest.mocked(Worker);
const MockedQueue = jest.mocked(Queue);
const MockedIORedis = jest.mocked(IORedis);
const QUEUE_CA_PEM = rootCertificates[0];

describe('BullmqService lifecycle', () => {
  let redis: RedisDouble;
  let workerRedis: RedisDouble;
  let readinessClients: RedisDouble[];
  let nextReadinessClient: RedisDouble | undefined;
  let workers: WorkerDouble[];
  let queues: QueueDouble[];
  let loggerError: jest.SpyInstance;
  let loggerWarn: jest.SpyInstance;

  beforeEach(() => {
    readinessClients = [];
    nextReadinessClient = undefined;
    workers = [];
    queues = [];
    redis = createRedisDouble('ready');
    workerRedis = createRedisDouble('ready');

    MockedIORedis.mockImplementation(((_url: unknown, rawOptions: unknown) => {
      const options = rawOptions as Record<string, unknown>;
      if (options.maxRetriesPerRequest === null) {
        return workerRedis as unknown as IORedis;
      }
      if (options.connectTimeout !== 400) {
        return redis as unknown as IORedis;
      }

      const readinessClient = nextReadinessClient ?? createRedisDouble('wait');
      nextReadinessClient = undefined;
      readinessClients.push(readinessClient);
      return readinessClient as unknown as IORedis;
    }) as never);
    MockedWorker.mockImplementation((queueName) => {
      const worker = createWorkerDouble();
      worker.name = String(queueName);
      workers.push(worker);
      return worker as unknown as Worker;
    });
    MockedQueue.mockImplementation(() => {
      const queue: QueueDouble = {
        close: jest.fn(() => Promise.resolve()),
        connection: createRedisConnectionDouble(),
      };
      queues.push(queue);
      return queue as unknown as Queue;
    });
    loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    loggerWarn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('closes a not-ready worker without waiting for readiness', async () => {
    const service = createService();
    const worker = service.createWorker('test-queue', () => Promise.resolve());
    const workerDouble = workers[0];
    workerDouble.waitUntilReady.mockImplementation(
      () => new Promise<never>(() => undefined),
    );

    const shutdown = service.onModuleDestroy();

    expect(workerDouble.close).toHaveBeenCalledTimes(1);
    expect(workerDouble.waitUntilReady).not.toHaveBeenCalled();
    expect(workerDouble.run).toHaveBeenCalledTimes(1);
    await shutdown;
    expect(worker).toBe(workerDouble);
  });

  it('requires every assigned worker processing loop to be running', () => {
    const service = createService();
    service.createWorker('first-queue', () => Promise.resolve());
    service.createWorker('second-queue', () => Promise.resolve());

    expect(service.hasAvailableWorkers(['first-queue', 'second-queue'])).toBe(
      true,
    );
    expect(service.hasAvailableWorkers(['missing-queue'])).toBe(false);

    workers[1].isPaused.mockReturnValue(true);
    expect(service.hasAvailableWorkers(['first-queue', 'second-queue'])).toBe(
      false,
    );
    workers[1].isPaused.mockReturnValue(false);
    workers[1].isRunning.mockReturnValue(false);
    expect(service.hasAvailableWorkers(['second-queue'])).toBe(false);
  });

  it('makes an unexpectedly settled worker run unavailable', async () => {
    const service = createService();
    service.createWorker('settled-queue', () => Promise.resolve());

    expect(service.hasAvailableWorkers(['settled-queue'])).toBe(true);
    workers[0].resolveRun();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(service.hasAvailableWorkers(['settled-queue'])).toBe(false);
    expect(loggerError).toHaveBeenCalledWith({
      event: 'bullmq.worker.run_stopped',
      stage: 'unexpected_settlement',
    });
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain(
      'settled-queue',
    );
  });

  it('makes a rejected worker run unavailable without an unhandled rejection', async () => {
    const service = createService();
    service.createWorker('failed-queue', () => Promise.resolve());

    workers[0].rejectRun(new Error('worker run failed'));
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(service.hasAvailableWorkers(['failed-queue'])).toBe(false);
    expect(loggerError).toHaveBeenCalledWith({
      event: 'bullmq.worker.failed',
      stage: 'runtime',
    });
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain(
      'failed-queue',
    );
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain(
      'worker run failed',
    );
  });

  it('reports workers unavailable during normal drain', async () => {
    const service = createService();
    service.createWorker('draining-queue', () => Promise.resolve());

    const drain = service.beginWorkerDrain();

    expect(service.hasAvailableWorkers(['draining-queue'])).toBe(false);
    await drain;
  });

  it('shares one shutdown operation across concurrent destroy calls', async () => {
    const service = createService();
    service.createWorker('test-queue', () => Promise.resolve());
    service.getQueue('test-queue');

    const first = service.onModuleDestroy();
    const second = service.onModuleDestroy();

    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(workers[0].close).toHaveBeenCalledTimes(1);
    expect(queues[0].close).toHaveBeenCalledTimes(1);
    expect(redis.quit).toHaveBeenCalledTimes(1);
    expect(workerRedis.quit).toHaveBeenCalledTimes(1);
    expect(redis.disconnect).not.toHaveBeenCalled();
    expect(workerRedis.disconnect).not.toHaveBeenCalled();
  });

  it('stops worker intake before final queue and shared Redis cleanup', async () => {
    let resolveWorkerClose: (() => void) | undefined;
    const workerClose = new Promise<void>((resolve) => {
      resolveWorkerClose = resolve;
    });
    const service = createService();
    service.createWorker('test-queue', () => Promise.resolve());
    service.getQueue('test-queue');
    workers[0].close.mockReturnValue(workerClose);

    const firstDrain = service.beginWorkerDrain();
    const secondDrain = service.beginWorkerDrain();

    expect(secondDrain).toBe(firstDrain);
    expect(workers[0].close).toHaveBeenCalledTimes(1);
    expect(queues[0].close).not.toHaveBeenCalled();
    expect(redis.quit).not.toHaveBeenCalled();

    resolveWorkerClose?.();
    workers[0].resolveRun();
    await firstDrain;
    await service.onModuleDestroy();

    expect(workers[0].close).toHaveBeenCalledTimes(1);
    expect(queues[0].close).toHaveBeenCalledTimes(1);
    expect(redis.quit).toHaveBeenCalledTimes(1);
  });

  it('treats a shared quit closed-connection race as completed shutdown', async () => {
    const service = createService();
    service.createWorker('test-queue', () => Promise.resolve());
    service.getQueue('test-queue');
    redis.quit.mockImplementation(() => {
      redis.status = 'end';
      return Promise.reject(new Error('Connection is closed.'));
    });

    const first = service.onModuleDestroy();
    const second = service.onModuleDestroy();

    expect(second).toBe(first);
    await expect(first).resolves.toBeUndefined();
    expect(workers[0].close).toHaveBeenCalledTimes(1);
    expect(queues[0].close).toHaveBeenCalledTimes(1);
    expect(redis.quit).toHaveBeenCalledTimes(1);
    expect(redis.disconnect).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('treats a recognized shared quit socket closure as completed shutdown', async () => {
    const service = createService();
    service.createWorker('test-queue', () => Promise.resolve());
    const error = Object.assign(new Error('socket closed during shutdown'), {
      code: 'EPIPE',
    });
    redis.quit.mockRejectedValue(error);

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    expect(redis.quit).toHaveBeenCalledTimes(1);
    expect(redis.disconnect).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('keeps unexpected shared quit failures observable and single-flight', async () => {
    const service = createService();
    service.createWorker('test-queue', () => Promise.resolve());
    const error = new Error('shared redis shutdown failed');
    redis.quit.mockRejectedValue(error);

    const first = service.onModuleDestroy();

    await expect(first).rejects.toBe(error);
    expect(service.onModuleDestroy()).toBe(first);
    await expect(service.onModuleDestroy()).rejects.toBe(error);
    expect(redis.quit).toHaveBeenCalledTimes(1);
    expect(redis.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects the shared connection once when it is not active', async () => {
    redis.status = 'wait';
    const service = createService();
    service.createWorker('test-queue', () => Promise.resolve());
    service.getQueue('test-queue');

    await Promise.all([service.onModuleDestroy(), service.onModuleDestroy()]);

    expect(workers[0].close).toHaveBeenCalledTimes(1);
    expect(queues[0].close).toHaveBeenCalledTimes(1);
    expect(redis.disconnect).toHaveBeenCalledTimes(1);
    expect(redis.quit).not.toHaveBeenCalled();
  });

  it('logs worker failures outside shutdown', () => {
    const service = createService();
    service.createWorker('test-queue', () => Promise.resolve());
    const error = new Error('runtime redis failure');

    workers[0].emitError(error);

    expect(loggerError).toHaveBeenCalledWith({
      event: 'bullmq.worker.failed',
      stage: 'runtime',
    });
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain('test-queue');
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain(
      'runtime redis failure',
    );
  });

  it('does not log expected closure noise from a closing worker', async () => {
    let resolveClose: (() => void) | undefined;
    const closePromise = new Promise<void>((resolve) => {
      resolveClose = resolve;
    });
    const service = createService();
    service.createWorker('test-queue', () => Promise.resolve());
    workers[0].close.mockImplementation(() => {
      workers[0].closing = closePromise;
      return closePromise;
    });

    const shutdown = service.onModuleDestroy();
    redis.status = 'end';
    workers[0].emitError(new Error('Connection is closed.'));

    expect(loggerError).not.toHaveBeenCalled();
    resolveClose?.();
    workers[0].resolveRun();
    await shutdown;
  });

  it('sanitizes non-connection worker failures during shutdown', async () => {
    let resolveClose: (() => void) | undefined;
    const closePromise = new Promise<void>((resolve) => {
      resolveClose = resolve;
    });
    const service = createService();
    service.createWorker('test-queue', () => Promise.resolve());
    workers[0].close.mockImplementation(() => {
      workers[0].closing = closePromise;
      return closePromise;
    });
    const error = new Error('job cleanup failed');

    const shutdown = service.onModuleDestroy();
    workers[0].emitError(error);

    expect(loggerError).toHaveBeenCalledWith({
      event: 'lifecycle.resource.failed',
      resource: 'bullmq_worker',
      stage: 'drain',
    });
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain(error.message);
    resolveClose?.();
    workers[0].resolveRun();
    await shutdown;
  });

  it('does not log a late blocking-connection error after central close', async () => {
    const service = createService();
    service.createWorker('test-queue', () => Promise.resolve());
    const blockingConnection = workers[0].blockingConnection;
    workers[0].close.mockImplementation(() => {
      workers[0].closing = Promise.resolve();
      workers[0].resolveRun();
      blockingConnection.status = 'closed';
      blockingConnection.removeAllListeners();
      return workers[0].closing;
    });

    await service.onModuleDestroy();
    blockingConnection.emitError(new Error('connection closed after teardown'));

    expect(loggerError).not.toHaveBeenCalled();
  });

  it('stops a stalled-check timer published after worker close', async () => {
    const service = createService();
    service.createWorker('test-queue', () => Promise.resolve());
    const lateStopper = jest.fn<void, []>();

    await service.onModuleDestroy();
    workers[0].stalledCheckStopper = lateStopper;

    expect(lateStopper).toHaveBeenCalledTimes(1);
  });

  it('preserves a stalled-check stopper published during construction', () => {
    const service = createService();
    service.createWorker('test-queue', () => Promise.resolve());

    expect(workers[0].stalledCheckStopper).toBeDefined();
  });

  it('keeps shutdown failures observable', async () => {
    const service = createService();
    service.createWorker('test-queue', () => Promise.resolve());
    workers[0].close.mockRejectedValue(new Error('close failed'));

    const shutdown = service.onModuleDestroy();

    await expect(shutdown).rejects.toThrow('close failed');
    expect(service.onModuleDestroy()).toBe(shutdown);
    expect(workers[0].close).toHaveBeenCalledTimes(1);
  });

  it('separates bounded commands, a shared Worker connection, and readiness Redis', async () => {
    const service = createService();
    service.getQueue('separation-queue');
    service.createWorker('separation-worker', () => Promise.resolve());
    service.createWorker('second-separation-worker', () => Promise.resolve());

    await service.ping();

    const redisCalls = MockedIORedis.mock.calls as unknown as Array<
      [string, Record<string, unknown>]
    >;
    expect(redisCalls).toHaveLength(3);
    expect(redisCalls[0][1]).toMatchObject({
      lazyConnect: true,
      enableOfflineQueue: false,
      autoResendUnfulfilledCommands: false,
      maxRetriesPerRequest: 0,
      connectTimeout: 500,
      commandTimeout: 750,
    });
    expect(
      (redisCalls[0][1].retryStrategy as (attempt: number) => number)(1),
    ).toBeGreaterThan(0);
    expect(redisCalls[1][1]).toMatchObject({
      lazyConnect: true,
      enableOfflineQueue: true,
      autoResendUnfulfilledCommands: true,
      maxRetriesPerRequest: null,
      connectTimeout: 500,
    });
    expect(redisCalls[1][1]).not.toHaveProperty('commandTimeout');
    expect(
      (redisCalls[1][1].retryStrategy as (attempt: number) => number)(1),
    ).toBeGreaterThan(0);
    expect(redisCalls[2][1]).toMatchObject({
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      connectTimeout: 400,
      commandTimeout: 400,
    });
    expect(
      (redisCalls[2][1].retryStrategy as (attempt: number) => number | null)(1),
    ).toBeNull();
    expect(
      (MockedQueue.mock.calls[0][1] as { connection: unknown }).connection,
    ).toBe(redis);
    expect(
      (MockedQueue.mock.calls[0][1] as { skipWaitingForReady: boolean })
        .skipWaitingForReady,
    ).toBe(true);
    expect(
      (MockedWorker.mock.calls[0][2] as { connection: unknown }).connection,
    ).toBe(workerRedis);
    expect(
      (MockedWorker.mock.calls[1][2] as { connection: unknown }).connection,
    ).toBe(workerRedis);
    expect(workerRedis).not.toBe(redis);
    expect(readinessClients[0]).not.toBe(redis);
    expect(readinessClients[0]).not.toBe(workerRedis);

    await service.onModuleDestroy();
    expect(redis.quit).toHaveBeenCalledTimes(1);
    expect(workerRedis.quit).toHaveBeenCalledTimes(1);
  });

  it.each(['api', 'core-worker', 'media-worker', 'maintenance-scheduler'])(
    'uses the bounded command policy independently of runtime role %s',
    async (runtimeRole) => {
      const config = {
        get: jest.fn((key: string) => {
          if (key === 'NODE_ENV') return 'test';
          if (key === 'QUEUE_REDIS_URL') return 'redis://test.invalid:6379';
          if (key === 'DATABASE_RUNTIME_ROLE') return runtimeRole;
          return undefined;
        }),
      } as unknown as ConfigService;
      const service = new BullmqService(config);
      const redisCalls = MockedIORedis.mock.calls as unknown as Array<
        [string, Record<string, unknown>]
      >;

      expect(redisCalls[0][1]).toMatchObject({
        lazyConnect: true,
        enableOfflineQueue: false,
        autoResendUnfulfilledCommands: false,
        maxRetriesPerRequest: 0,
        connectTimeout: 500,
        commandTimeout: 750,
      });
      expect(
        (redisCalls[0][1].retryStrategy as (attempt: number) => number)(1),
      ).toBeGreaterThan(0);
      expect(config.get).toHaveBeenCalledWith('QUEUE_REDIS_URL');
      expect(config.get).toHaveBeenCalledWith('QUEUE_REDIS_TLS_CA_PEM');
      expect(config.get).not.toHaveBeenCalledWith('REALTIME_REDIS_URL');

      await service.onModuleDestroy();
    },
  );

  it('reads only the Queue Redis environment contract', async () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'QUEUE_REDIS_URL' ? 'redis://test.invalid:6379' : undefined,
      ),
    } as unknown as ConfigService;
    const service = new BullmqService(config);

    expect(config.get).toHaveBeenCalledWith('QUEUE_REDIS_URL');
    expect(config.get).toHaveBeenCalledWith('QUEUE_REDIS_TLS_CA_PEM');
    expect(config.get).not.toHaveBeenCalledWith('REALTIME_REDIS_URL');
    expect(config.get).not.toHaveBeenCalledWith(
      'REALTIME_REDIS_TLS_CA_PEM',
    );
    expect(config.get).not.toHaveBeenCalledWith('REDIS_URL');
    await service.onModuleDestroy();
  });

  it('applies the Queue CA and peer verification to command, Worker, and readiness clients', async () => {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'QUEUE_REDIS_URL') {
          return 'rediss://queue-cache.invalid:6379';
        }
        if (key === 'QUEUE_REDIS_TLS_CA_PEM') return QUEUE_CA_PEM;
        return undefined;
      }),
    } as unknown as ConfigService;
    const service = new BullmqService(config);
    service.createWorker('secure-worker', () => Promise.resolve());
    await service.ping();

    const redisCalls = MockedIORedis.mock.calls as unknown as Array<
      [string, Record<string, unknown>]
    >;
    expect(redisCalls).toHaveLength(3);
    for (const [url, options] of redisCalls) {
      expect(url).toBe('rediss://queue-cache.invalid:6379');
      expect(options.tls).toEqual({
        ca: [QUEUE_CA_PEM],
        rejectUnauthorized: true,
      });
    }
    expect(config.get).not.toHaveBeenCalledWith('REALTIME_REDIS_TLS_CA_PEM');

    await service.onModuleDestroy();
  });

  it('single-flights concurrent readiness calls through one candidate', async () => {
    const service = createService();
    const connect = deferred<void>();
    const candidate = createRedisDouble('wait');
    candidate.connect.mockImplementation(() => connect.promise);
    nextReadinessClient = candidate;

    const first = service.ping();
    const second = service.ping();

    expect(second).toBe(first);
    expect(readinessClients).toEqual([candidate]);
    expect(candidate.connect).toHaveBeenCalledTimes(1);
    expect(candidate.ping).not.toHaveBeenCalled();

    candidate.status = 'ready';
    connect.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(candidate.ping).toHaveBeenCalledTimes(1);
    expect(readinessState(service).queueReadinessClient).toBe(candidate);
    expect(readinessState(service).queueReadinessFlight).toBeNull();

    await service.onModuleDestroy();
  });

  it('bounds a hanging owned-client PING and observes its late rejection', async () => {
    jest.useFakeTimers();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);

    try {
      const service = createService();
      await service.ping();
      const client = readinessClients[0];
      const latePing = deferred<string>();
      client.ping.mockImplementationOnce(() => latePing.promise);

      const failure = service.ping();
      const failureAssertion = expect(failure).rejects.toThrow(
        'queue_redis_unavailable',
      );
      await flushPromises();
      await jest.advanceTimersByTimeAsync(600);

      await failureAssertion;
      expect(client.disconnect).toHaveBeenCalledTimes(1);
      expect(readinessState(service).queueReadinessClient).toBeUndefined();
      expect(readinessState(service).queueReadinessFlight).toBeNull();

      latePing.reject(new Error('redis://late-secret@internal'));
      await flushPromises();
      expect(unhandled).toEqual([]);
      expect(jest.getTimerCount()).toBe(0);

      await service.onModuleDestroy();
    } finally {
      process.off('unhandledRejection', onUnhandled);
      jest.useRealTimers();
    }
  });

  it('bounds a hanging readiness candidate and never publishes it late', async () => {
    jest.useFakeTimers();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);

    try {
      const service = createService();
      const connect = deferred<void>();
      const candidate = createRedisDouble('wait');
      candidate.connect.mockImplementation(() => connect.promise);
      nextReadinessClient = candidate;

      const failure = service.ping();
      const failureAssertion = expect(failure).rejects.toThrow(
        'queue_redis_unavailable',
      );
      await flushPromises();
      await jest.advanceTimersByTimeAsync(600);

      await failureAssertion;
      expect(candidate.disconnect).toHaveBeenCalledTimes(1);
      expect(readinessState(service).queueReadinessClient).toBeUndefined();
      expect(readinessState(service).queueReadinessFlight).toBeNull();

      candidate.status = 'ready';
      connect.resolve();
      await flushPromises();
      expect(readinessState(service).queueReadinessClient).toBeUndefined();
      expect(unhandled).toEqual([]);
      expect(jest.getTimerCount()).toBe(0);

      await service.onModuleDestroy();
    } finally {
      process.off('unhandledRejection', onUnhandled);
      jest.useRealTimers();
    }
  });

  it('creates a fresh bounded candidate after failure and reuses it after recovery', async () => {
    const service = createService();
    const failed = createRedisDouble('wait');
    failed.connect.mockRejectedValue(new Error('first unavailable'));
    nextReadinessClient = failed;

    await expect(service.ping()).rejects.toThrow('queue_redis_unavailable');
    expect(failed.disconnect).toHaveBeenCalledTimes(1);

    const recovered = createRedisDouble('wait');
    nextReadinessClient = recovered;
    await expect(service.ping()).resolves.toBeUndefined();
    await expect(service.ping()).resolves.toBeUndefined();

    expect(readinessClients).toEqual([failed, recovered]);
    expect(recovered.connect).toHaveBeenCalledTimes(1);
    expect(recovered.ping).toHaveBeenCalledTimes(2);
    expect(readinessState(service).queueReadinessClient).toBe(recovered);

    await service.onModuleDestroy();
  });

  it('prevents a stale retired client from clearing or closing a newer owner', async () => {
    jest.useFakeTimers();
    try {
      const service = createService();
      await service.ping();
      const stale = readinessClients[0];
      const latePing = deferred<string>();
      stale.ping.mockImplementationOnce(() => latePing.promise);

      const staleFailure = service.ping();
      const staleFailureAssertion = expect(staleFailure).rejects.toThrow(
        'queue_redis_unavailable',
      );
      await flushPromises();
      await jest.advanceTimersByTimeAsync(600);
      await staleFailureAssertion;

      const recovered = createRedisDouble('wait');
      nextReadinessClient = recovered;
      await service.ping();
      expect(readinessState(service).queueReadinessClient).toBe(recovered);

      latePing.reject(new Error('stale client failed late'));
      await flushPromises();
      await service.ping();

      expect(readinessState(service).queueReadinessClient).toBe(recovered);
      expect(stale.disconnect).toHaveBeenCalledTimes(1);
      expect(recovered.disconnect).not.toHaveBeenCalled();
      expect(recovered.ping).toHaveBeenCalledTimes(2);

      await service.onModuleDestroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('prevents candidate ownership when shutdown begins during readiness', async () => {
    jest.useFakeTimers();
    try {
      const service = createService();
      const connect = deferred<void>();
      const candidate = createRedisDouble('wait');
      candidate.connect.mockImplementation(() => connect.promise);
      nextReadinessClient = candidate;

      const readiness = service.ping();
      const shutdown = service.onModuleDestroy();
      await flushPromises();
      await jest.advanceTimersByTimeAsync(600);

      await expect(readiness).rejects.toThrow('queue_redis_unavailable');
      await expect(shutdown).resolves.toBeUndefined();
      expect(candidate.disconnect).toHaveBeenCalledTimes(1);
      expect(candidate.quit).not.toHaveBeenCalled();
      expect(readinessState(service).queueReadinessClient).toBeUndefined();
      expect(redis.quit).toHaveBeenCalledTimes(1);
      await expect(service.ping()).rejects.toThrow('queue_redis_unavailable');
    } finally {
      jest.useRealTimers();
    }
  });

  it('closes a healthy readiness client exactly once with a bounded QUIT', async () => {
    jest.useFakeTimers();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);

    try {
      const service = createService();
      await service.ping();
      const client = readinessClients[0];
      const lateQuit = deferred<string>();
      client.quit.mockImplementation(() => lateQuit.promise);

      const first = service.onModuleDestroy();
      const second = service.onModuleDestroy();
      expect(second).toBe(first);
      await flushPromises();
      await jest.advanceTimersByTimeAsync(400);

      await expect(first).resolves.toBeUndefined();
      expect(client.quit).toHaveBeenCalledTimes(1);
      expect(client.disconnect).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);

      lateQuit.reject(new Error('late quit rejection'));
      await flushPromises();
      expect(unhandled).toEqual([]);
      expect(client.disconnect).toHaveBeenCalledTimes(1);
    } finally {
      process.off('unhandledRejection', onUnhandled);
      jest.useRealTimers();
    }
  });

  it('isolates readiness failure from workers, queues, and the shared connection', async () => {
    jest.useFakeTimers();
    try {
      const service = createService();
      service.createWorker('isolation-worker', () => Promise.resolve());
      service.getQueue('isolation-queue');
      const candidate = createRedisDouble('wait');
      candidate.connect.mockImplementation(
        () => new Promise<void>(() => undefined),
      );
      nextReadinessClient = candidate;

      const failure = service.ping();
      const failureAssertion = expect(failure).rejects.toThrow(
        'queue_redis_unavailable',
      );
      await flushPromises();
      await jest.advanceTimersByTimeAsync(600);
      await failureAssertion;

      expect(workers).toHaveLength(1);
      expect(queues).toHaveLength(1);
      expect(workers[0].close).not.toHaveBeenCalled();
      expect(queues[0].close).not.toHaveBeenCalled();
      expect(service.hasAvailableWorkers(['isolation-worker'])).toBe(true);
      expect(redis.connect).not.toHaveBeenCalled();
      expect(redis.ping).not.toHaveBeenCalled();
      expect(redis.quit).not.toHaveBeenCalled();
      expect(redis.disconnect).not.toHaveBeenCalled();

      await service.onModuleDestroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('settles before the real executor deadline and starts fresh after recovery', async () => {
    jest.useFakeTimers();
    try {
      const service = createService();
      const executor = new BoundedProbeExecutor();
      const failedConnect = deferred<void>();
      const failed = createRedisDouble('wait');
      failed.connect.mockImplementation(() => failedConnect.promise);
      nextReadinessClient = failed;

      const outage = executor.run('queue-redis', () => service.ping());
      await flushPromises();
      await jest.advanceTimersByTimeAsync(600);
      await expect(outage).resolves.toBe(false);
      expect(readinessState(service).queueReadinessFlight).toBeNull();
      expect(executorState(executor).active.size).toBe(0);

      const recovered = createRedisDouble('wait');
      nextReadinessClient = recovered;
      await expect(
        executor.run('queue-redis', () => service.ping()),
      ).resolves.toBe(true);
      expect(readinessClients).toEqual([failed, recovered]);
      expect(executorState(executor).active.size).toBe(0);
      expect(jest.getTimerCount()).toBe(0);

      failedConnect.reject(new Error('late failed connection'));
      await flushPromises();
      await service.onModuleDestroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('logs readiness errors once with fixed sanitized fields', async () => {
    const service = createService();
    const candidate = createRedisDouble('wait');
    candidate.connect.mockRejectedValue(
      new Error('redis://user:secret@private.internal'),
    );
    nextReadinessClient = candidate;

    await expect(service.ping()).rejects.toThrow('queue_redis_unavailable');
    candidate.emitError(new Error('another secret'));

    expect(loggerWarn).toHaveBeenCalledTimes(1);
    expect(loggerWarn).toHaveBeenCalledWith({
      event: 'bullmq.readiness.unavailable',
      stage: 'connection',
    });
    expect(JSON.stringify(loggerWarn.mock.calls)).not.toContain('secret');
    expect(JSON.stringify(loggerWarn.mock.calls)).not.toContain('private');

    await service.onModuleDestroy();
  });

  it('converts synchronous readiness failures to the fixed provider error', async () => {
    const service = createService();
    const candidate = createRedisDouble('wait');
    candidate.connect.mockImplementation(() => {
      throw new Error('redis://user:secret@private.internal');
    });
    nextReadinessClient = candidate;

    await expect(service.ping()).rejects.toThrow('queue_redis_unavailable');
    expect(candidate.disconnect).toHaveBeenCalledTimes(1);

    const recovered = createRedisDouble('wait');
    nextReadinessClient = recovered;
    await expect(service.ping()).resolves.toBeUndefined();
    recovered.ping.mockImplementationOnce(() => {
      throw new Error('redis://user:secret@private.internal');
    });

    await expect(service.ping()).rejects.toThrow('queue_redis_unavailable');
    expect(recovered.disconnect).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(loggerWarn.mock.calls)).not.toContain('secret');

    await service.onModuleDestroy();
  });

  function createService(runtimeRole = 'api'): BullmqService {
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'test';
        if (key === 'QUEUE_REDIS_URL') return 'redis://test.invalid:6379';
        if (key === 'DATABASE_RUNTIME_ROLE') return runtimeRole;
        return undefined;
      }),
    } as unknown as ConfigService;
    return new BullmqService(config);
  }

  function createWorkerDouble(): WorkerDouble {
    const listeners: ErrorListener[] = [];
    const runState = deferred<void>();
    const blockingConnectionListeners: ErrorListener[] = [];
    const blockingConnection: RedisConnectionDouble = {
      initializing: Promise.resolve(),
      status: 'initializing',
      on: jest.fn<RedisConnectionDouble, [string, ErrorListener]>(),
      removeAllListeners: jest.fn<RedisConnectionDouble, [string?]>(),
      emitError: (error: Error) => {
        for (const listener of blockingConnectionListeners) listener(error);
      },
    };
    blockingConnection.on.mockImplementation(
      (event: string, listener: ErrorListener) => {
        if (event === 'error') blockingConnectionListeners.push(listener);
        return blockingConnection;
      },
    );
    blockingConnection.removeAllListeners.mockImplementation(
      (event?: string) => {
        if (event === undefined || event === 'error') {
          blockingConnectionListeners.length = 0;
        }
        return blockingConnection;
      },
    );
    const connection: RedisConnectionDouble = {
      initializing: Promise.resolve(),
      status: 'initializing',
      on: jest.fn<RedisConnectionDouble, [string, ErrorListener]>(),
      removeAllListeners: jest.fn<RedisConnectionDouble, [string?]>(),
      emitError: () => undefined,
    };
    const worker: WorkerDouble = {
      name: '',
      blockingConnection,
      connection,
      closing: undefined,
      stalledCheckStopper: jest.fn<void, []>(),
      close: jest.fn<Promise<void>, []>(),
      run: jest.fn(() => runState.promise),
      isPaused: jest.fn(() => false),
      isRunning: jest.fn(() => true),
      waitUntilReady: jest.fn(() => Promise.resolve(undefined)),
      on: jest.fn<WorkerDouble, [string, ErrorListener]>(),
      emitError: (error: Error) => {
        for (const listener of listeners) listener(error);
      },
      emit: jest.fn((event: string, error: Error) => {
        if (event === 'error') {
          for (const listener of listeners) listener(error);
        }
        return true;
      }),
      rejectRun: runState.reject,
      resolveRun: () => runState.resolve(),
    };
    worker.close.mockImplementation(() => {
      worker.closing = Promise.resolve();
      worker.resolveRun();
      return worker.closing;
    });
    worker.on.mockImplementation((event: string, listener: ErrorListener) => {
      if (event === 'error') listeners.push(listener);
      return worker;
    });
    return worker;
  }

  function createRedisConnectionDouble(): RedisConnectionDouble {
    return {
      initializing: Promise.resolve(),
      status: 'closed',
      on: jest.fn<RedisConnectionDouble, [string, ErrorListener]>(),
      removeAllListeners: jest.fn<RedisConnectionDouble, [string?]>(),
      emitError: () => undefined,
    };
  }

  function createRedisDouble(status: string): RedisDouble {
    const listeners: ErrorListener[] = [];
    const client: RedisDouble = {
      status,
      connect: jest.fn(async () => {
        client.status = 'ready';
      }),
      ping: jest.fn(() => Promise.resolve('PONG')),
      quit: jest.fn(() => Promise.resolve('OK')),
      disconnect: jest.fn<void, []>(),
      on: jest.fn<RedisDouble, [string, ErrorListener]>(),
      emitError: (error: Error) => {
        for (const listener of listeners) listener(error);
      },
    };
    client.on.mockImplementation((event: string, listener: ErrorListener) => {
      if (event === 'error') listeners.push(listener);
      return client;
    });
    return client;
  }

  function readinessState(service: BullmqService): {
    queueReadinessClient?: RedisDouble;
    queueReadinessFlight: Promise<void> | null;
  } {
    return service as unknown as {
      queueReadinessClient?: RedisDouble;
      queueReadinessFlight: Promise<void> | null;
    };
  }

  function executorState(executor: BoundedProbeExecutor): {
    active: Map<string, Promise<boolean>>;
  } {
    return executor as unknown as {
      active: Map<string, Promise<boolean>>;
    };
  }

  function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, reject, resolve };
  }

  async function flushPromises(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }
});
