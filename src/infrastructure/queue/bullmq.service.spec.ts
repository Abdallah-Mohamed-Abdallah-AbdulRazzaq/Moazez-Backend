import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { BullmqService } from './bullmq.service';

jest.mock('bullmq');
jest.mock('ioredis');

type ErrorListener = (error: Error) => void;

type WorkerDouble = {
  blockingConnection: RedisConnectionDouble;
  connection: RedisConnectionDouble;
  closing: Promise<void> | undefined;
  stalledCheckStopper?: () => void;
  close: jest.Mock<Promise<void>, []>;
  run: jest.Mock<Promise<void>, []>;
  waitUntilReady: jest.Mock<Promise<unknown>, []>;
  on: jest.Mock<WorkerDouble, [string, ErrorListener]>;
  emitError: (error: Error) => void;
};

type QueueDouble = {
  close: jest.Mock<Promise<void>, []>;
  connection: RedisConnectionDouble;
};

type RedisDouble = {
  status: string;
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

describe('BullmqService lifecycle', () => {
  let redis: RedisDouble;
  let workers: WorkerDouble[];
  let queues: QueueDouble[];
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    workers = [];
    queues = [];
    const redisErrorListeners: ErrorListener[] = [];
    redis = {
      status: 'ready',
      quit: jest.fn(() => Promise.resolve('OK')),
      disconnect: jest.fn<void, []>(),
      on: jest.fn<RedisDouble, [string, ErrorListener]>(),
      emitError: (error: Error) => {
        for (const listener of redisErrorListeners) listener(error);
      },
    };
    redis.on.mockImplementation((event: string, listener: ErrorListener) => {
      if (event === 'error') redisErrorListeners.push(listener);
      return redis;
    });

    MockedIORedis.mockImplementation(() => redis as unknown as IORedis);
    MockedWorker.mockImplementation(() => {
      const worker = createWorkerDouble();
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
    expect(redis.disconnect).not.toHaveBeenCalled();
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

    expect(loggerError).toHaveBeenCalledWith(
      'BullMQ worker test-queue failed: runtime redis failure',
      error.stack,
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
    await shutdown;
  });

  it('does not log a late blocking-connection error after central close', async () => {
    const service = createService();
    service.createWorker('test-queue', () => Promise.resolve());
    const blockingConnection = workers[0].blockingConnection;
    workers[0].close.mockImplementation(() => {
      workers[0].closing = Promise.resolve();
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

  function createService(): BullmqService {
    const config = {
      getOrThrow: jest.fn(() => 'redis://test.invalid:6379'),
    } as unknown as ConfigService;
    return new BullmqService(config);
  }

  function createWorkerDouble(): WorkerDouble {
    const listeners: ErrorListener[] = [];
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
      blockingConnection,
      connection,
      closing: undefined,
      stalledCheckStopper: jest.fn<void, []>(),
      close: jest.fn<Promise<void>, []>(),
      run: jest.fn(() => Promise.resolve()),
      waitUntilReady: jest.fn(() => Promise.resolve(undefined)),
      on: jest.fn<WorkerDouble, [string, ErrorListener]>(),
      emitError: (error: Error) => {
        for (const listener of listeners) listener(error);
      },
    };
    worker.close.mockImplementation(() => {
      worker.closing = Promise.resolve();
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
});
