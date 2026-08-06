import { Test } from '@nestjs/testing';
import { DATABASE_RUNTIME_ENVIRONMENT_FIELDS } from '../infrastructure/database/database-runtime-env.validation';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { BullmqService } from '../infrastructure/queue/bullmq.service';
import { REALTIME_EMITTER_REDIS_CLIENT } from '../infrastructure/realtime/redis-realtime-publisher.service';
import { StorageService } from '../infrastructure/storage/storage.service';

describe('runtime application-context wiring', () => {
  const originalEnvironment = new Map<string, string | undefined>();

  beforeAll(() => {
    for (const key of DATABASE_RUNTIME_ENVIRONMENT_FIELDS) {
      originalEnvironment.set(key, process.env[key]);
    }
    for (const [key, value] of Object.entries(runtimeEnvironment())) {
      if (!originalEnvironment.has(key)) {
        originalEnvironment.set(key, process.env[key]);
      }
      process.env[key] = value;
    }
  });

  afterAll(() => {
    for (const [key, value] of originalEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('initializes Core Worker with exactly six consumers and no repeats', async () => {
    setDatabaseRuntimeEnvironment('core-worker');
    const { CoreWorkerRuntimeModule } = jest.requireActual<
      typeof import('./core-worker/core-worker-runtime.module')
    >('./core-worker/core-worker-runtime.module');
    const queue = queueHarness();
    const module = await Test.createTestingModule({
      imports: [CoreWorkerRuntimeModule],
    })
      .overrideProvider(BullmqService)
      .useValue(queue)
      .overrideProvider(PrismaService)
      .useValue(prismaHarness())
      .overrideProvider(StorageService)
      .useValue(storageHarness())
      .overrideProvider(REALTIME_EMITTER_REDIS_CLIENT)
      .useValue(redisHarness())
      .compile();

    await module.init();
    expect(queue.workerQueues.sort()).toEqual([
      'communication-notification-push',
      'communication-notifications',
      'dismissal-request-expiry',
      'files-imports',
      'school-email-delivery',
      'settings-branding-logo-cleanup',
    ]);
    expect(queue.repeatRegistrations).toEqual([]);
    await module.close();
  });

  it('initializes Media Worker with only cleanup consumption and no repeats', async () => {
    setDatabaseRuntimeEnvironment('media-worker');
    const { MediaWorkerRuntimeModule } = jest.requireActual<
      typeof import('./media-worker/media-worker-runtime.module')
    >('./media-worker/media-worker-runtime.module');
    const queue = queueHarness();
    const module = await Test.createTestingModule({
      imports: [MediaWorkerRuntimeModule],
    })
      .overrideProvider(BullmqService)
      .useValue(queue)
      .overrideProvider(PrismaService)
      .useValue(prismaHarness())
      .overrideProvider(StorageService)
      .useValue(storageHarness())
      .compile();

    await module.init();
    expect(queue.workerQueues).toEqual(['learning-media-cleanup']);
    expect(queue.repeatRegistrations).toEqual([]);
    await module.close();
  });

  it('initializes Maintenance Scheduler with three repeats and no consumers', async () => {
    for (const field of DATABASE_RUNTIME_ENVIRONMENT_FIELDS) {
      delete process.env[field];
    }
    const { MaintenanceSchedulerRuntimeModule } = jest.requireActual<
      typeof import('./maintenance-scheduler/maintenance-scheduler-runtime.module')
    >('./maintenance-scheduler/maintenance-scheduler-runtime.module');
    const queue = queueHarness();
    const module = await Test.createTestingModule({
      imports: [MaintenanceSchedulerRuntimeModule],
    })
      .overrideProvider(BullmqService)
      .useValue(queue)
      .compile();

    await module.init();
    expect(queue.workerQueues).toEqual([]);
    expect(queue.repeatRegistrations).toHaveLength(3);
    await module.close();
  });
});

function queueHarness() {
  const workerQueues: string[] = [];
  const repeatRegistrations: Array<{ queueName: string; jobName: string }> = [];
  return {
    workerQueues,
    repeatRegistrations,
    createWorker: jest.fn((queueName: string) => {
      workerQueues.push(queueName);
      return { on: jest.fn() };
    }),
    registerRepeatJob: jest.fn(
      async (queueName: string, jobName: string): Promise<void> => {
        repeatRegistrations.push({ queueName, jobName });
      },
    ),
    addJob: jest.fn().mockResolvedValue({ id: 'job' }),
    getQueue: jest.fn(),
    getQueueReadiness: jest.fn().mockResolvedValue({
      name: 'queue',
      status: 'ok',
      counts: { waiting: 0, active: 0, delayed: 0, failed: 0 },
    }),
    ping: jest.fn().mockResolvedValue(undefined),
    hasExactAvailableWorkers: jest.fn().mockReturnValue(true),
    hasExactRepeatRegistrations: jest.fn().mockReturnValue(true),
    beginWorkerDrain: jest.fn().mockResolvedValue(undefined),
  };
}

function prismaHarness() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([{ value: 1 }]),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  };
}

function storageHarness() {
  return {
    checkReadiness: jest.fn().mockResolvedValue(undefined),
    resolveBucket: jest.fn().mockReturnValue('runtime-private'),
  };
}

function redisHarness() {
  return {
    status: 'ready',
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
    ping: jest.fn().mockResolvedValue('PONG'),
    publish: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue('OK'),
  };
}

function runtimeEnvironment(): Record<string, string> {
  return {
    NODE_ENV: 'test',
    APP_URL: 'http://127.0.0.1:3000',
    APP_PROBE_PORT: '19090',
    APP_SHUTDOWN_TIMEOUT_MS: '15000',
    DATABASE_URL: 'postgresql://runtime:runtime@127.0.0.1:5432/runtime',
    QUEUE_REDIS_URL: 'redis://127.0.0.1:6379',
    REALTIME_REDIS_URL: 'redis://127.0.0.1:6379',
    STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
    STORAGE_ACCESS_KEY: 'runtime-access',
    STORAGE_SECRET_KEY: 'runtime-secret',
    STORAGE_BUCKET: 'runtime-private',
    STORAGE_PUBLIC_BUCKET: 'runtime-public',
    FCM_ENABLED: 'false',
    FCM_DRY_RUN: 'true',
  };
}

function setDatabaseRuntimeEnvironment(
  role: 'core-worker' | 'media-worker',
): void {
  const coreWorker = role === 'core-worker';
  process.env.DATABASE_RUNTIME_ROLE = role;
  process.env.DATABASE_CONNECTION_LIMIT = coreWorker ? '6' : '3';
  process.env.DATABASE_POOL_TIMEOUT_SECONDS = '10';
  process.env.DATABASE_CONNECT_TIMEOUT_SECONDS = '5';
}
