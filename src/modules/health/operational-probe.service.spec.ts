import { Logger } from '@nestjs/common';
import { ApplicationLifecycleState } from '../../bootstrap/application-lifecycle.state';
import type { PrismaService } from '../../infrastructure/database/prisma.service';
import type { FirebaseAdminService } from '../../infrastructure/push/firebase/firebase-admin.service';
import type { BullmqService } from '../../infrastructure/queue/bullmq.service';
import type { RealtimeGateway } from '../../infrastructure/realtime/realtime.gateway';
import type { RealtimeStateStoreService } from '../../infrastructure/realtime/realtime-state-store.service';
import type { RedisRealtimePublisherService } from '../../infrastructure/realtime/redis-realtime-publisher.service';
import type { StorageService } from '../../infrastructure/storage/storage.service';
import type { MediaRuntimeStartupGuard } from '../files/uploads/application/media-runtime-startup.guard';
import {
  CORE_WORKER_ASSIGNED_CONSUMERS,
  createOperationalRoleManifests,
  MEDIA_WORKER_ASSIGNED_CONSUMERS,
} from './operational-probe.manifests';
import { OperationalProbeService } from './operational-probe.service';
import type { TemporaryDiskProbe } from './temporary-disk.probe';

describe('OperationalProbeService', () => {
  let loggerWarn: jest.SpyInstance;
  let loggerLog: jest.SpyInstance;

  beforeEach(() => {
    loggerWarn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    loggerLog = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
  it('keeps startup unavailable before and during delayed initialization', async () => {
    const harness = createHarness();

    await expect(
      harness.service.evaluate('api', 'startup'),
    ).resolves.toMatchObject({ statusCode: 503 });
    await Promise.resolve();
    await expect(
      harness.service.evaluate('api', 'startup'),
    ).resolves.toMatchObject({ statusCode: 503 });

    harness.service.markInitializationComplete();
    await expect(
      harness.service.evaluate('api', 'startup'),
    ).resolves.toMatchObject({ statusCode: 200 });
  });

  it('keeps startup unavailable after initialization failure', async () => {
    const harness = createHarness();
    harness.service.markInitializationFailed();

    await expect(
      harness.service.evaluate('api', 'startup'),
    ).resolves.toMatchObject({ statusCode: 503 });
  });

  it('keeps liveness healthy without invoking external checks', async () => {
    const harness = createHarness();
    harness.prisma.$queryRaw.mockRejectedValue(new Error('postgres down'));
    harness.queue.ping.mockRejectedValue(new Error('redis down'));
    harness.storage.checkReadiness.mockRejectedValue(new Error('storage down'));
    harness.realtime.checkReadiness.mockRejectedValue(
      new Error('provider down'),
    );
    harness.realtimeStateStore.checkReadiness.mockRejectedValue(
      new Error('state provider down'),
    );

    await expect(
      harness.service.evaluate('api', 'liveness'),
    ).resolves.toMatchObject({ statusCode: 200 });
    expect(harness.prisma.$queryRaw).not.toHaveBeenCalled();
    expect(harness.queue.ping).not.toHaveBeenCalled();
    expect(harness.storage.checkReadiness).not.toHaveBeenCalled();
    expect(harness.realtime.checkReadiness).not.toHaveBeenCalled();
    expect(harness.realtimeStateStore.checkReadiness).not.toHaveBeenCalled();
  });

  it.each([
    ['prisma', (harness: Harness) => harness.prisma.$queryRaw],
    ['queue Redis', (harness: Harness) => harness.queue.ping],
    ['storage', (harness: Harness) => harness.storage.checkReadiness],
    ['realtime Redis', (harness: Harness) => harness.realtime.checkReadiness],
    [
      'realtime state Redis',
      (harness: Harness) => harness.realtimeStateStore.checkReadiness,
    ],
  ])(
    'fails API readiness on %s failure and recovers on the next probe',
    async (_label, selectCheck) => {
      const harness = readyHarness();
      const check = selectCheck(harness);
      check.mockRejectedValueOnce(new Error('dependency unavailable'));

      await expect(
        harness.service.evaluate('api', 'readiness'),
      ).resolves.toMatchObject({ statusCode: 503 });
      await expect(
        harness.service.evaluate('api', 'readiness'),
      ).resolves.toMatchObject({ statusCode: 200 });
    },
  );

  it('logs fixed failed dependency identifiers once and records recovery', async () => {
    const harness = readyHarness();
    const rawFailure =
      'redis://state-user:state-secret@internal/private-credential';
    harness.realtime.checkReadiness.mockRejectedValueOnce(
      new Error(rawFailure),
    );

    await expect(
      harness.service.evaluate('api', 'readiness'),
    ).resolves.toMatchObject({ statusCode: 503 });
    await expect(
      harness.service.evaluate('api', 'readiness'),
    ).resolves.toMatchObject({ statusCode: 200 });

    expect(loggerWarn).toHaveBeenCalledWith({
      event: 'management.probe.readiness_unavailable',
      role: 'api',
      dependencies: ['realtime-adapter-redis'],
    });
    expect(loggerWarn).toHaveBeenCalledTimes(1);
    expect(loggerLog).toHaveBeenCalledWith({
      event: 'management.probe.readiness_recovered',
      role: 'api',
    });
    expect(JSON.stringify(loggerWarn.mock.calls)).not.toContain(rawFailure);
  });

  it('does not require disabled realtime or optional API storage', async () => {
    const harness = readyHarness({
      manifests: createOperationalRoleManifests({
        realtimeEnabled: false,
        storageRequiredForApi: false,
      }),
    });
    harness.realtime.checkReadiness.mockRejectedValue(new Error('disabled'));
    harness.realtimeStateStore.checkReadiness.mockRejectedValue(
      new Error('disabled'),
    );
    harness.storage.checkReadiness.mockRejectedValue(new Error('not required'));

    await expect(
      harness.service.evaluate('api', 'readiness'),
    ).resolves.toMatchObject({ statusCode: 200 });
    expect(harness.realtime.checkReadiness).not.toHaveBeenCalled();
    expect(harness.realtimeStateStore.checkReadiness).not.toHaveBeenCalled();
    expect(harness.storage.checkReadiness).not.toHaveBeenCalled();
  });

  it.each([
    ['core-worker', CORE_WORKER_ASSIGNED_CONSUMERS],
    ['media-worker', MEDIA_WORKER_ASSIGNED_CONSUMERS],
  ] as const)(
    'fails %s startup and readiness when an assigned consumer is absent',
    async (role, assignedConsumers) => {
      const harness = readyHarness({ role });
      harness.queue.hasExactAvailableWorkers.mockImplementation(
        (names: readonly string[]) => names !== assignedConsumers,
      );

      await expect(
        harness.service.evaluate(role, 'startup'),
      ).resolves.toMatchObject({ statusCode: 503 });
      await expect(
        harness.service.evaluate(role, 'readiness'),
      ).resolves.toMatchObject({ statusCode: 503 });
    },
  );

  it.each(['ffprobe_missing', 'ffprobe_invalid', 'ffprobe_timeout'])(
    'fails API readiness for %s without exposing it',
    async (failure) => {
      const harness = readyHarness();
      harness.mediaRuntime.assertReady.mockRejectedValue(new Error(failure));

      const result = await harness.service.evaluate(
        'api',
        'readiness',
      );

      expect(result.statusCode).toBe(503);
      expect(JSON.stringify(result.response)).not.toContain(failure);
    },
  );

  it('accepts a verified API media runtime and writable temporary disk', async () => {
    const harness = readyHarness();

    await expect(
      harness.service.evaluate('api', 'readiness'),
    ).resolves.toMatchObject({ statusCode: 200 });
    expect(harness.mediaRuntime.assertReady).toHaveBeenCalledTimes(1);
    expect(harness.temporaryDisk.checkReadiness).toHaveBeenCalledTimes(1);
  });

  it('fails API readiness when the temporary directory is unwritable', async () => {
    const harness = readyHarness();
    harness.temporaryDisk.checkReadiness.mockRejectedValue(
      new Error('EACCES C:\\secret\\temporary'),
    );

    const result = await harness.service.evaluate('api', 'readiness');

    expect(result.statusCode).toBe(503);
    expect(JSON.stringify(result.response)).not.toContain('temporary');
    expect(JSON.stringify(result.response)).not.toContain('C:\\secret');
  });

  it('does not require ffprobe or temporary disk for Media Worker readiness', async () => {
    const harness = readyHarness({ role: 'media-worker' });
    harness.mediaRuntime.assertReady.mockRejectedValue(new Error('forbidden'));
    harness.temporaryDisk.checkReadiness.mockRejectedValue(
      new Error('forbidden'),
    );

    await expect(
      harness.service.evaluate('media-worker', 'readiness'),
    ).resolves.toMatchObject({ statusCode: 200 });
    expect(harness.mediaRuntime.assertReady).not.toHaveBeenCalled();
    expect(harness.temporaryDisk.checkReadiness).not.toHaveBeenCalled();
  });

  it('returns public-safe bounded fields for dependency and secret failures', async () => {
    const harness = readyHarness();
    const secrets = [
      'https://storage-user:storage-secret@storage.internal/private',
      'smtp://email-user:email-secret@email.internal',
      'postgresql://db-user:db-secret@database.internal/moazez',
    ];
    harness.storage.checkReadiness.mockRejectedValue(
      new Error(secrets.join(' ')),
    );

    const result = await harness.service.evaluate('api', 'readiness');
    const serialized = JSON.stringify(result.response);

    expect(result.statusCode).toBe(503);
    expect(Object.keys(result.response)).toEqual([
      'status',
      'version',
      'timestamp',
    ]);
    for (const secret of secrets) expect(serialized).not.toContain(secret);
    expect(serialized).not.toMatch(
      /database|redis|storage|queue|email|provider|topology|path/i,
    );
  });

  it('single-flights concurrent readiness requests', async () => {
    const harness = readyHarness();
    const prisma = deferred<unknown>();
    harness.prisma.$queryRaw.mockReturnValue(prisma.promise);

    const first = harness.service.evaluate('api', 'readiness');
    const second = harness.service.evaluate('api', 'readiness');
    await Promise.resolve();

    expect(harness.prisma.$queryRaw).toHaveBeenCalledTimes(1);
    prisma.resolve([{ value: 1 }]);
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ statusCode: 200 }),
      expect.objectContaining({ statusCode: 200 }),
    ]);
  });

  it('retains a hanging state-store flight independently when the adapter fails', async () => {
    jest.useFakeTimers();
    try {
      const harness = readyHarness();
      const stateStore = deferred<void>();
      harness.realtime.checkReadiness.mockRejectedValueOnce(
        new Error('adapter unavailable'),
      );
      harness.realtimeStateStore.checkReadiness.mockReturnValueOnce(
        stateStore.promise,
      );

      const first = harness.service.evaluate('api', 'readiness');
      await flushPromises();
      await jest.advanceTimersByTimeAsync(750);
      await expect(first).resolves.toMatchObject({ statusCode: 503 });

      const second = harness.service.evaluate('api', 'readiness');
      await flushPromises();
      expect(harness.realtime.checkReadiness).toHaveBeenCalledTimes(2);
      expect(
        harness.realtimeStateStore.checkReadiness,
      ).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(750);
      await expect(second).resolves.toMatchObject({ statusCode: 503 });

      stateStore.resolve();
      await flushPromises();
      await expect(
        harness.service.evaluate('api', 'readiness'),
      ).resolves.toMatchObject({ statusCode: 200 });
      expect(
        harness.realtimeStateStore.checkReadiness,
      ).toHaveBeenCalledTimes(2);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('retains a hanging adapter flight independently when the state store fails', async () => {
    jest.useFakeTimers();
    try {
      const harness = readyHarness();
      const adapter = deferred<void>();
      harness.realtime.checkReadiness.mockReturnValueOnce(adapter.promise);
      harness.realtimeStateStore.checkReadiness.mockRejectedValueOnce(
        new Error('state store unavailable'),
      );

      const first = harness.service.evaluate('api', 'readiness');
      await flushPromises();
      await jest.advanceTimersByTimeAsync(750);
      await expect(first).resolves.toMatchObject({ statusCode: 503 });

      const second = harness.service.evaluate('api', 'readiness');
      await flushPromises();
      expect(harness.realtime.checkReadiness).toHaveBeenCalledTimes(1);
      expect(
        harness.realtimeStateStore.checkReadiness,
      ).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(750);
      await expect(second).resolves.toMatchObject({ statusCode: 503 });

      adapter.resolve();
      await flushPromises();
      await expect(
        harness.service.evaluate('api', 'readiness'),
      ).resolves.toMatchObject({ statusCode: 200 });
      expect(harness.realtime.checkReadiness).toHaveBeenCalledTimes(2);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('bounds a dependency that never settles', async () => {
    const harness = readyHarness();
    harness.queue.ping.mockReturnValue(new Promise<void>(() => undefined));
    const startedAt = Date.now();

    const result = await harness.service.evaluate('api', 'readiness');

    expect(result.statusCode).toBe(503);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(700);
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });

  it('fails startup and readiness while draining but leaves liveness healthy', async () => {
    const harness = readyHarness();
    harness.lifecycle.beginDraining();

    await expect(
      harness.service.evaluate('api', 'startup'),
    ).resolves.toMatchObject({ statusCode: 503 });
    await expect(
      harness.service.evaluate('api', 'readiness'),
    ).resolves.toMatchObject({ statusCode: 503 });
    await expect(
      harness.service.evaluate('api', 'liveness'),
    ).resolves.toMatchObject({ statusCode: 200 });
  });
});

type Harness = ReturnType<typeof createHarness>;

function readyHarness(
  options: Parameters<typeof createHarness>[0] = {},
): Harness {
  const harness = createHarness(options);
  harness.service.markInitializationComplete();
  return harness;
}

function createHarness(
  options: {
    manifests?: ReturnType<typeof createOperationalRoleManifests>;
    role?: 'api' | 'core-worker' | 'media-worker' | 'maintenance-scheduler';
  } = {},
) {
  const lifecycle = new ApplicationLifecycleState();
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ value: 1 }]),
  };
  const queue = {
    ping: jest.fn().mockResolvedValue(undefined),
    hasExactAvailableWorkers: jest.fn().mockReturnValue(true),
    hasExactRepeatRegistrations: jest.fn().mockReturnValue(true),
  };
  const realtime = {
    checkReadiness: jest.fn().mockResolvedValue(undefined),
  };
  const realtimeStateStore = {
    checkReadiness: jest.fn().mockResolvedValue(undefined),
  };
  const storage = {
    checkReadiness: jest.fn().mockResolvedValue(undefined),
  };
  const mediaRuntime = {
    assertReady: jest.fn().mockResolvedValue(undefined),
    isVerified: jest.fn().mockReturnValue(true),
  };
  const temporaryDisk = {
    checkReadiness: jest.fn().mockResolvedValue(undefined),
  };
  const realtimeEmitter = {
    checkReadiness: jest.fn().mockResolvedValue(undefined),
  };
  const firebase = {
    checkReadiness: jest.fn().mockReturnValue({ mode: 'disabled' }),
  };
  const service = new OperationalProbeService(
    lifecycle,
    prisma as unknown as PrismaService,
    queue as unknown as BullmqService,
    realtime as unknown as RealtimeGateway,
    realtimeStateStore as unknown as RealtimeStateStoreService,
    storage as unknown as StorageService,
    mediaRuntime as unknown as MediaRuntimeStartupGuard,
    temporaryDisk as unknown as TemporaryDiskProbe,
    options.manifests ?? createOperationalRoleManifests(),
    options.role ?? 'api',
    realtimeEmitter as unknown as RedisRealtimePublisherService,
    firebase as unknown as FirebaseAdminService,
  );
  return {
    lifecycle,
    mediaRuntime,
    firebase,
    prisma,
    queue,
    realtime,
    realtimeStateStore,
    realtimeEmitter,
    service,
    storage,
    temporaryDisk,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
