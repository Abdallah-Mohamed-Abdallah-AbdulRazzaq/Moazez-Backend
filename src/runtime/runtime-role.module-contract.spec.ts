import {
  HTTP_CODE_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { HttpStatus } from '@nestjs/common';
import { AppModule } from '../app.module';
import { RealtimeGateway } from '../infrastructure/realtime/realtime.gateway';
import { RedisRealtimePublisherService } from '../infrastructure/realtime/redis-realtime-publisher.service';
import { RealtimePresenceService } from '../infrastructure/realtime/realtime-presence.service';
import { RealtimeStateStoreService } from '../infrastructure/realtime/realtime-state-store.service';
import { CompleteLearningMediaUploadUseCase } from '../modules/files/uploads/application/learning-media-upload.use-cases';
import { MediaVerifierService } from '../modules/files/uploads/application/media-verifier.service';
import { StorageService } from '../infrastructure/storage/storage.service';
import { LearningMediaController } from '../modules/academics/curriculum/controller/learning-media.controller';
import {
  CORE_WORKER_ASSIGNED_CONSUMERS,
  MAINTENANCE_SCHEDULE_REGISTRATIONS,
  MEDIA_WORKER_ASSIGNED_CONSUMERS,
} from '../modules/health/operational-probe.manifests';
import { CORE_WORKER_CONSUMER_PROVIDERS } from './core-worker/core-worker-consumers.module';
import { MEDIA_WORKER_CONSUMER_PROVIDERS } from './media-worker/media-worker-consumer.module';
import { BrandingLogoReconciliationSchedule } from './maintenance-scheduler/branding-logo-reconciliation.schedule';
import { DismissalExpirySchedule } from './maintenance-scheduler/dismissal-expiry.schedule';
import { LearningMediaCleanupSchedule } from './maintenance-scheduler/learning-media-cleanup.schedule';
import { DATABASE_RUNTIME_ENVIRONMENT_FIELDS } from '../infrastructure/database/database-runtime-env.validation';
import {
  validateMaintenanceSchedulerEnv,
  validateMediaWorkerEnv,
} from './runtime-env.validation';

const CONSUMER_PROVIDER_NAMES = [
  'CommunicationNotificationGenerationWorker',
  'CommunicationNotificationPushWorker',
  'SchoolEmailDeliveryWorker',
  'ImportValidationWorker',
  'DismissalRequestExpiryWorker',
  'BrandingLogoCleanupWorker',
  'LearningMediaCleanupService',
];

const SCHEDULE_PROVIDER_NAMES = [
  DismissalExpirySchedule.name,
  LearningMediaCleanupSchedule.name,
  BrandingLogoReconciliationSchedule.name,
];

describe('runtime role module graphs', () => {
  const originalDatabaseEnvironment = new Map<string, string | undefined>();

  beforeAll(() => {
    for (const field of DATABASE_RUNTIME_ENVIRONMENT_FIELDS) {
      originalDatabaseEnvironment.set(field, process.env[field]);
    }
  });

  afterAll(() => {
    for (const [field, value] of originalDatabaseEnvironment) {
      if (value === undefined) delete process.env[field];
      else process.env[field] = value;
    }
  });

  it('keeps the API graph producer-only while retaining HTTP realtime and synchronous media', () => {
    const graph = inspectModuleGraph(AppModule);

    expect(intersection(graph.providers, CONSUMER_PROVIDER_NAMES)).toEqual([]);
    expect(intersection(graph.providers, SCHEDULE_PROVIDER_NAMES)).toEqual([]);
    expect(graph.providers).toEqual(
      expect.arrayContaining([
        RealtimeGateway.name,
        RealtimePresenceService.name,
        RealtimeStateStoreService.name,
        CompleteLearningMediaUploadUseCase.name,
        MediaVerifierService.name,
      ]),
    );
    expect(graph.controllers.length).toBeGreaterThan(0);
  });

  it('keeps Learning Media completion on POST 200 with synchronous verifier ownership', () => {
    const completion = LearningMediaController.prototype.complete;
    const dependencies = Reflect.getMetadata(
      'design:paramtypes',
      CompleteLearningMediaUploadUseCase,
    ) as Array<{ name: string }>;

    expect(Reflect.getMetadata(PATH_METADATA, LearningMediaController)).toBe(
      'academics/learning-media/uploads',
    );
    expect(Reflect.getMetadata(PATH_METADATA, completion)).toBe(
      ':uploadId/complete',
    );
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, completion)).toBe(
      HttpStatus.OK,
    );
    expect(dependencies.map((dependency) => dependency.name)).toContain(
      MediaVerifierService.name,
    );
    expect(dependencies.map((dependency) => dependency.name)).not.toContain(
      'BullmqService',
    );
  });

  it('owns exactly the six Core consumers without HTTP or local Socket.IO', async () => {
    setDatabaseRuntimeEnvironment('core-worker');
    const { CoreWorkerRuntimeModule } = jest.requireActual<
      typeof import('./core-worker/core-worker-runtime.module')
    >('./core-worker/core-worker-runtime.module');
    const graph = inspectModuleGraph(CoreWorkerRuntimeModule);

    expect(CORE_WORKER_CONSUMER_PROVIDERS.map(providerName).sort()).toEqual([
      'BrandingLogoCleanupWorker',
      'CommunicationNotificationGenerationWorker',
      'CommunicationNotificationPushWorker',
      'DismissalRequestExpiryWorker',
      'ImportValidationWorker',
      'SchoolEmailDeliveryWorker',
    ]);
    expect(CORE_WORKER_ASSIGNED_CONSUMERS).toHaveLength(6);
    expect(intersection(graph.providers, CONSUMER_PROVIDER_NAMES)).toHaveLength(
      6,
    );
    expect(intersection(graph.providers, SCHEDULE_PROVIDER_NAMES)).toEqual([]);
    expect(graph.controllers).toEqual([]);
    expect(graph.providers).toContain(RedisRealtimePublisherService.name);
    expect(graph.providers).not.toContain(RealtimeGateway.name);
  });

  it('owns only Learning Media cleanup without API media verification capability', async () => {
    setDatabaseRuntimeEnvironment('media-worker');
    const { MediaWorkerRuntimeModule } = jest.requireActual<
      typeof import('./media-worker/media-worker-runtime.module')
    >('./media-worker/media-worker-runtime.module');
    const graph = inspectModuleGraph(MediaWorkerRuntimeModule);

    expect(MEDIA_WORKER_CONSUMER_PROVIDERS.map(providerName)).toEqual([
      'LearningMediaCleanupService',
    ]);
    expect(MEDIA_WORKER_ASSIGNED_CONSUMERS).toEqual(['learning-media-cleanup']);
    expect(intersection(graph.providers, CONSUMER_PROVIDER_NAMES)).toEqual([
      'LearningMediaCleanupService',
    ]);
    expect(intersection(graph.providers, SCHEDULE_PROVIDER_NAMES)).toEqual([]);
    expect(graph.controllers).toEqual([]);
    expect(graph.providers).not.toContain(RealtimeGateway.name);
    expect(graph.providers).not.toContain(MediaVerifierService.name);
    expect(graph.providers).not.toContain('TemporaryDiskProbe');
  });

  it('owns exactly three registrations and no consumer, controller, Gateway, or storage provider', async () => {
    for (const field of DATABASE_RUNTIME_ENVIRONMENT_FIELDS) {
      delete process.env[field];
    }
    const { MaintenanceSchedulerRuntimeModule } = jest.requireActual<
      typeof import('./maintenance-scheduler/maintenance-scheduler-runtime.module')
    >('./maintenance-scheduler/maintenance-scheduler-runtime.module');
    const graph = inspectModuleGraph(MaintenanceSchedulerRuntimeModule);
    const registerRepeatJob = jest.fn().mockResolvedValue(undefined);

    await new DismissalExpirySchedule({
      registerRepeatJob,
    } as never).onModuleInit();
    await new LearningMediaCleanupSchedule({
      registerRepeatJob,
    } as never).onModuleInit();
    await new BrandingLogoReconciliationSchedule({
      registerRepeatJob,
    } as never).onModuleInit();

    expect(intersection(graph.providers, CONSUMER_PROVIDER_NAMES)).toEqual([]);
    expect(
      intersection(graph.providers, SCHEDULE_PROVIDER_NAMES).sort(),
    ).toEqual([...SCHEDULE_PROVIDER_NAMES].sort());
    expect(graph.controllers).toEqual([]);
    expect(graph.providers).not.toContain(RealtimeGateway.name);
    expect(graph.providers).not.toContain(StorageService.name);
    expect(registerRepeatJob).toHaveBeenCalledTimes(3);
    expect(
      registerRepeatJob.mock.calls.map(([queueName, jobName, , options]) => ({
        queueName,
        jobName,
        jobId: options.jobId,
        pattern: options.repeat.pattern,
        every: options.repeat.every,
      })),
    ).toEqual(MAINTENANCE_SCHEDULE_REGISTRATIONS);
  });

  it('does not require database, storage, ffprobe, or temporary-media configuration outside owning roles', () => {
    expect(
      validateMaintenanceSchedulerEnv({ REDIS_URL: 'redis://127.0.0.1:6379' }),
    ).not.toHaveProperty('DATABASE_URL');
    expect(
      validateMediaWorkerEnv({
        REDIS_URL: 'redis://127.0.0.1:6379',
        DATABASE_URL: 'postgresql://worker:worker@127.0.0.1:5432/worker',
        STORAGE_ENDPOINT: 'http://127.0.0.1:9000',
        STORAGE_ACCESS_KEY: 'media-access',
        STORAGE_SECRET_KEY: 'media-secret',
        STORAGE_BUCKET: 'media-private',
        STORAGE_PUBLIC_BUCKET: 'media-public',
      }),
    ).not.toHaveProperty('FFPROBE_PATH');
    expect(() =>
      validateMaintenanceSchedulerEnv({
        REDIS_URL: 'redis://127.0.0.1:6379',
        DATABASE_URL:
          'postgresql://runtime-user:runtime-value@127.0.0.1:5432/moazez',
      }),
    ).toThrow(/DATABASE_URL/u);
  });
});

function inspectModuleGraph(root: unknown): {
  providers: string[];
  controllers: string[];
} {
  const providers = new Set<string>();
  const controllers = new Set<string>();
  const visited = new Set<unknown>();

  const visit = (candidate: unknown): void => {
    if (!candidate || visited.has(candidate)) return;
    visited.add(candidate);
    if (isForwardReference(candidate)) {
      visit(candidate.forwardRef());
      return;
    }

    const dynamic = isDynamicModule(candidate) ? candidate : undefined;
    const moduleClass = dynamic?.module ?? candidate;
    if (typeof moduleClass !== 'function') return;

    const moduleProviders = [
      ...(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, moduleClass) ?? []),
      ...(dynamic?.providers ?? []),
    ];
    const moduleControllers = [
      ...(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, moduleClass) ?? []),
      ...(dynamic?.controllers ?? []),
    ];
    const moduleImports = [
      ...(Reflect.getMetadata(MODULE_METADATA.IMPORTS, moduleClass) ?? []),
      ...(dynamic?.imports ?? []),
    ];

    for (const provider of moduleProviders)
      providers.add(providerName(provider));
    for (const controller of moduleControllers) {
      controllers.add(providerName(controller));
    }
    for (const imported of moduleImports) visit(imported);
  };

  visit(root);
  return {
    providers: [...providers].filter(Boolean).sort(),
    controllers: [...controllers].filter(Boolean).sort(),
  };
}

function providerName(provider: unknown): string {
  if (typeof provider === 'function') return provider.name;
  if (provider && typeof provider === 'object' && 'useClass' in provider) {
    return providerName((provider as { useClass: unknown }).useClass);
  }
  if (provider && typeof provider === 'object' && 'provide' in provider) {
    return providerName((provider as { provide: unknown }).provide);
  }
  return typeof provider === 'symbol' ? (provider.description ?? '') : '';
}

function intersection(values: string[], expected: string[]): string[] {
  const expectedSet = new Set(expected);
  return values.filter((value) => expectedSet.has(value)).sort();
}

function isDynamicModule(value: unknown): value is {
  module: Function;
  imports?: unknown[];
  providers?: unknown[];
  controllers?: unknown[];
} {
  return Boolean(value && typeof value === 'object' && 'module' in value);
}

function isForwardReference(
  value: unknown,
): value is { forwardRef: () => unknown } {
  return Boolean(value && typeof value === 'object' && 'forwardRef' in value);
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
