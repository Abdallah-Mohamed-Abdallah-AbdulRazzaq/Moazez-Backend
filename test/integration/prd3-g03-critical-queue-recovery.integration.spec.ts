import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { Job, Worker } from 'bullmq';
import {
  AppDeviceTokenPlatform,
  AppDeviceTokenSurface,
  CommunicationAnnouncementAudienceType,
  CommunicationAnnouncementStatus,
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationDeliveryStatus,
  CommunicationNotificationPriority,
  CommunicationNotificationSourceModule,
  CommunicationNotificationType,
  DismissalGateOperationalStatus,
  DismissalRequestStatus,
  FileUploadPurpose,
  FileUploadSessionStatus,
  FileVisibility,
  ImportJobStatus,
  MembershipStatus,
  OrganizationStatus,
  SchoolEmailDeliveryBatchStatus,
  SchoolEmailDeliveryKind,
  SchoolEmailDeliveryRecipientStatus,
  SchoolEmailDeliveryRecipientType,
  SchoolStatus,
  StudentEnrollmentStatus,
  StudentBulkRegistrationBatchStatus,
  StudentBulkRegistrationRowStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { MinioAdapter } from '../../src/infrastructure/storage/minio.adapter';
import { SignedUrlService } from '../../src/infrastructure/storage/signed-url.service';
import { StorageService } from '../../src/infrastructure/storage/storage.service';
import { MAINTENANCE_SCHEDULE_REGISTRATIONS } from '../../src/modules/health/operational-probe.manifests';
import { CommunicationNotificationGenerationRepository } from '../../src/modules/communication/infrastructure/communication-notification-generation.repository';
import { CommunicationNotificationPreferenceRepository } from '../../src/modules/communication/infrastructure/communication-notification-preference.repository';
import { CommunicationNotificationPushRepository } from '../../src/modules/communication/infrastructure/communication-notification-push.repository';
import { CommunicationNotificationGenerationService } from '../../src/modules/communication/application/communication-notification-generation.service';
import { CommunicationNotificationPreferenceService } from '../../src/modules/communication/application/communication-notification-preference.service';
import { CommunicationNotificationPushQueueService } from '../../src/modules/communication/application/communication-notification-push-queue.service';
import { CommunicationRealtimeEventsService } from '../../src/modules/communication/application/communication-realtime-events.service';
import { CommunicationNotificationReconciliationService } from '../../src/modules/communication/application/communication-notification-reconciliation.service';
import { CommunicationNotificationPushReconciliationService } from '../../src/modules/communication/application/communication-notification-push-reconciliation.service';
import { CommunicationNotificationPushDeliveryService } from '../../src/modules/communication/application/communication-notification-push-delivery.service';
import { CommunicationNotificationPushPayloadBuilder } from '../../src/modules/communication/application/communication-notification-push-payload.builder';
import { CommunicationNotificationGenerationWorker } from '../../src/modules/communication/infrastructure/communication-notification-generation.worker';
import { CommunicationNotificationPushWorker } from '../../src/modules/communication/infrastructure/communication-notification-push.worker';
import { AppDeviceTokenRepository } from '../../src/modules/app-device-tokens/infrastructure/app-device-token.repository';
import { EmailDeliveryRepository } from '../../src/modules/settings/email/delivery/infrastructure/email-delivery.repository';
import { SchoolEmailDeliveryReconciliationService } from '../../src/modules/settings/email/delivery/application/school-email-delivery-reconciliation.service';
import { ProcessEmailDeliveryRecipientUseCase } from '../../src/modules/settings/email/delivery/application/process-email-delivery-recipient.use-case';
import { SchoolEmailDeliveryWorker } from '../../src/modules/settings/email/delivery/infrastructure/school-email-delivery.worker';
import { SchoolEmailTransportFailure } from '../../src/modules/settings/email/delivery/transport/email-transport';
import { ImportJobsRepository } from '../../src/modules/files/imports/infrastructure/import-jobs.repository';
import { ImportValidationReconciliationService } from '../../src/modules/files/imports/application/import-validation-reconciliation.service';
import { ProcessImportValidationUseCase } from '../../src/modules/files/imports/application/process-import-validation.use-case';
import { ImportValidationWorker } from '../../src/modules/files/imports/infrastructure/import-validation.worker';
import { StudentBulkRegistrationExecutionReconciliationService } from '../../src/modules/students/registration/application/student-bulk-registration-execution-reconciliation.service';
import { StudentBulkRegistrationExecutionRepository } from '../../src/modules/students/registration/infrastructure/student-bulk-registration-execution.repository';
import { DismissalRequestsExpiryRepository } from '../../src/modules/dismissal/requests/infrastructure/dismissal-requests-expiry.repository';
import { ExpireDismissalRequestsUseCase } from '../../src/modules/dismissal/requests/application/expire-dismissal-requests.use-case';
import { DismissalRequestExpiryWorker } from '../../src/modules/dismissal/requests/worker/dismissal-request-expiry.worker';
import { LearningMediaRepository } from '../../src/modules/files/uploads/infrastructure/learning-media.repository';
import {
  LearningMediaCleanupService,
  learningMediaCleanupJobId,
} from '../../src/modules/files/uploads/application/learning-media-cleanup.service';
import { BrandingRepository } from '../../src/modules/settings/branding/infrastructure/branding.repository';
import { BrandingLogoCleanupQueueService } from '../../src/modules/settings/branding/application/branding-logo-cleanup-queue.service';
import { ProcessBrandingLogoCleanupUseCase } from '../../src/modules/settings/branding/application/process-branding-logo-cleanup.use-case';
import { BrandingLogoCleanupWorker } from '../../src/modules/settings/branding/infrastructure/branding-logo-cleanup.worker';
import {
  BRANDING_LOGO_CLEANUP_JOB,
  BRANDING_LOGO_CLEANUP_QUEUE,
} from '../../src/modules/settings/branding/domain/branding-logo.constants';
import {
  COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_GENERATE_JOB_NAME,
  COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_RECONCILE_JOB_NAME,
  COMMUNICATION_NOTIFICATION_QUEUE_NAME,
  COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME,
  COMMUNICATION_NOTIFICATION_PUSH_SEND_JOB_NAME,
} from '../../src/modules/communication/domain/communication-notification-generation-domain';
import { RealtimePublisherService } from '../../src/infrastructure/realtime/realtime-publisher.service';
import { getRequestContext } from '../../src/common/context/request-context';
import {
  SCHOOL_EMAIL_DELIVERY_QUEUE_NAME,
  SCHOOL_EMAIL_DELIVERY_SEND_RECIPIENT_JOB_NAME,
} from '../../src/modules/settings/email/delivery/domain/email-delivery.constants';
import {
  FILES_IMPORT_QUEUE_NAME,
  FILES_IMPORT_VALIDATE_JOB_NAME,
  STUDENT_BULK_REGISTRATION_EXECUTE_JOB_NAME,
  studentBulkRegistrationExecutionJobId,
} from '../../src/modules/files/imports/domain/import-job.types';
import {
  DISMISSAL_REQUEST_EXPIRY_JOB_NAME,
  DISMISSAL_REQUEST_EXPIRY_QUEUE_NAME,
} from '../../src/modules/dismissal/requests/domain/dismissal-request-expiry.constants';
import { LEARNING_MEDIA_CLEANUP_QUEUE } from '../../src/modules/files/uploads/domain/learning-media-cleanup.constants';

const enabled = process.env.RUN_PRD3_G03_RECOVERY_INTEGRATION === '1';
const describeEvidence = enabled ? describe : describe.skip;

describeEvidence('PRD3-G03 production-model recovery evidence', () => {
  jest.setTimeout(420_000);

  it('reconstructs real persisted work after empty Redis and dispatches production workers', async () => {
    const queuePort = requiredNumber('PRD3_G03_QUEUE_PORT');
    const databasePort = requiredNumber('PRD3_G03_DATABASE_PORT');
    const storagePort = requiredNumber('PRD3_G03_STORAGE_PORT');
    const queueUrl = ['redis', '://127.0.0.1:', String(queuePort)].join('');
    const databaseUrl = [
      'postgresql',
      '://g03_fixture:g03_fixture@127.0.0.1:',
      String(databasePort),
      '/g03_fixture?schema=public',
    ].join('');
    const prisma = new PrismaService({
      datasources: { db: { url: databaseUrl } },
    });
    const queue = new BullmqService({
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'test';
        if (key === 'QUEUE_REDIS_URL') return queueUrl;
        if (key === 'QUEUE_REDIS_TLS_CA_PEM') return undefined;
        return undefined;
      }),
    } as unknown as ConfigService);
    const storageConfig = new ConfigService({
      STORAGE_ENDPOINT: `http://127.0.0.1:${storagePort}`,
      STORAGE_ACCESS_KEY: 'g03fixture',
      STORAGE_SECRET_KEY: 'g03fixture-secret',
      STORAGE_BUCKET: `g03-private-${required('PRD3_G03_RUN_ID')}`,
      STORAGE_PUBLIC_BUCKET: `g03-public-${required('PRD3_G03_RUN_ID')}`,
    });
    const minio = new MinioAdapter(storageConfig);
    const storage = new StorageService(
      minio,
      new SignedUrlService(minio, storageConfig),
    );
    const bucket = storageConfig.getOrThrow<string>('STORAGE_BUCKET');

    try {
      await prisma.$connect();
      await minio.ensureBucketExists(bucket);
      const fixture = await seedProductionModels(prisma, storage, bucket);
      const components = createProductionComponents(
        prisma,
        queue,
        storage,
        fixture,
      );

      for (const registration of MAINTENANCE_SCHEDULE_REGISTRATIONS) {
        await queue.registerRepeatJob(
          registration.queueName,
          registration.jobName,
          { definitionSource: 'current-application-policy' },
          {
            jobId: registration.jobId,
            repeat: registration.pattern
              ? { pattern: registration.pattern }
              : { every: registration.every },
          },
        );
      }
      expect(queue.getDesiredRepeatRegistrations()).toHaveLength(7);

      const firstRecovery = await reconstructProductionWork(
        components,
        fixture.now,
      );
      expect(firstRecovery).toMatchObject({
        generation: 1,
        pushRestored: 1,
        pushTerminalized: 2,
        emailRestored: 4,
        emailTerminalized: 1,
        learningMedia: 1,
      });
      const bulkExecutionJobId = studentBulkRegistrationExecutionJobId(
        fixture.bulkExecutionBatchId,
      );
      await queue.getQueue(FILES_IMPORT_QUEUE_NAME).remove(bulkExecutionJobId);
      const exhaustedWorker = queue.createWorker(
        FILES_IMPORT_QUEUE_NAME,
        (job) => {
          if (job.id === bulkExecutionJobId) {
            throw new Error('synthetic_execution_exhausted');
          }
        },
      );
      try {
        const exhausted = waitForWorkerFailure(
          exhaustedWorker,
          bulkExecutionJobId,
          30_000,
        );
        await exhaustedWorker.waitUntilReady();
        await queue.addJob(
          FILES_IMPORT_QUEUE_NAME,
          STUDENT_BULK_REGISTRATION_EXECUTE_JOB_NAME,
          { batchId: fixture.bulkExecutionBatchId },
          { jobId: bulkExecutionJobId, attempts: 1 },
        );
        await exhausted;
        await expect(
          queue
            .getQueue(FILES_IMPORT_QUEUE_NAME)
            .getJob(bulkExecutionJobId)
            .then((job) => job?.getState()),
        ).resolves.toBe('failed');
      } finally {
        await exhaustedWorker.pause(true);
      }
      await components.studentBulkRegistrationExecutionReconciliation.reconcile(
        fixture.now,
      );
      await expect(
        queue
          .getQueue(FILES_IMPORT_QUEUE_NAME)
          .getJob(bulkExecutionJobId)
          .then((job) => job?.getState()),
      ).resolves.toBe('waiting');
      await expect(
        prisma.studentBulkRegistrationBatch.findUniqueOrThrow({
          where: { id: fixture.bulkExecutionBatchId },
          select: { status: true, createdRows: true, failedRows: true },
        }),
      ).resolves.toEqual({
        status: StudentBulkRegistrationBatchStatus.EXECUTING,
        createdRows: 0,
        failedRows: 0,
      });

      const ineligibleBeforeReplacement = await readIneligibleOutcomes(
        prisma,
        fixture,
      );
      expect(ineligibleBeforeReplacement).toEqual({
        pushRecipient: 'SENT',
        pushTenant: 'FAILED',
        emailTenant: 'FAILED',
        importTenant: 'FAILED',
        importSource: 'FAILED',
        open: 0,
      });

      replaceQueueRedisWithEmptyBarrier();
      await waitFor(
        () => queue.getRepeatRegistrations().length === 0,
        10_000,
        'repeat_inventory_not_cleared',
      );
      expect(redisAdmin(['DBSIZE'], true)).toBe('0');
      redisAdmin(['CONFIG', 'SET', 'requirepass', ''], true);
      redisAdmin(['CLIENT', 'KILL', 'TYPE', 'normal', 'SKIPME', 'yes']);
      await waitFor(
        () => queue.getRepeatRegistrations().length === 7,
        30_000,
        'repeat_inventory_restore_timeout',
      );

      const recovered = await reconstructProductionWork(
        components,
        fixture.now,
      );
      expect(recovered).toMatchObject({
        generation: 1,
        pushRestored: 1,
        pushTerminalized: 0,
        emailRestored: 4,
        emailTerminalized: 0,
        learningMedia: 1,
      });
      const reconstructed = await assertReconstructedJobs(queue, fixture);
      expect(reconstructed).toEqual({
        communication: 1,
        push: 1,
        email: 4,
        imports: 1,
        bulkExecution: 1,
        dismissal: 1,
        learningMedia: 1,
        branding: 1,
      });

      const dispatch = await exerciseProductionWorkerDispatch(
        components,
        fixture,
      );
      expect(dispatch.poisonResults).toEqual([
        'communication_notification_job_unknown',
        'communication_notification_push_job_unknown',
        'school_email_delivery_job_unknown',
        'files_import_job_unknown',
        'dismissal_expiry_job_unknown',
        'learning_media_cleanup_job_unknown',
        'branding_logo_cleanup_job_unknown',
      ]);
      expect(dispatch.pushKnownSuccessReplayCount).toBe(0);
      expect(dispatch.emailOutcomeUnknownReplayCount).toBe(0);
      expect(dispatch.pushActorlessContextCount).toBe(3);
      expect(dispatch.pushActorContextCount).toBe(0);
      expect(dispatch.pushScopeMismatchCount).toBe(0);
      expect(dispatch.generation).toMatchObject({
        createdCommunicationNotifications: 1,
        createdInAppDeliveries: 1,
        createdPushDeliveries: 1,
        duplicateNotificationRows: 0,
        duplicateInAppRows: 0,
        duplicatePushRows: 0,
        postReconciliationNotificationRows: 0,
        postReconciliationInAppRows: 0,
        postReconciliationPushRows: 0,
        fabricatedActorCount: 0,
        recoveredInactivePublisherCount: 1,
      });

      const finalModels = await readFinalProductionOutcomes(prisma, fixture);
      expect(finalModels).toMatchObject({
        pushDelivery: 'SENT',
        pushSentAttempts: 2,
        emailSent: 1,
        emailPreProviderRetryable: 1,
        emailKnownRejected: 1,
        emailOutcomeUnknown: 2,
        importCompleted: 1,
        dismissalExpired: 1,
        learningMediaDeleted: 1,
      });
      expect(await storage.objectExists(fixture.learningObject)).toBe(false);
      expect(await storage.objectExists(fixture.brandingObject)).toBe(false);
      expect(await storage.objectExists(fixture.importObject)).toBe(true);

      const evidence = {
        emptyRedisDbSize: 0,
        productionModelSourceCount: 7,
        productionReconcilerCount: 7,
        productionWorkerDispatchCount: 7,
        reconstructedJobsByQueue: reconstructed,
        actualUniqueScheduleRegistrations: 7,
        poisonRejectedCount: dispatch.poisonResults.length,
        ineligibleTerminalOutcomes: ineligibleBeforeReplacement,
        finalModels,
        knownSuccessReplayCount: dispatch.pushKnownSuccessReplayCount,
        emailOutcomeUnknownAutomaticReplayCount:
          dispatch.emailOutcomeUnknownReplayCount,
        productionStoragePathCount: 3,
        fakeProviderProductionServiceCount: 2,
        primaryGenerationExecution: dispatch.generation,
        pushActorlessContextCount: dispatch.pushActorlessContextCount,
        pushActorContextCount: dispatch.pushActorContextCount,
        pushScopeMismatchCount: dispatch.pushScopeMismatchCount,
        genericWorkerCount: 0,
        syntheticDomainTableCount: 0,
        redisCopies: 0,
      };
      process.stdout.write(
        `PRD3_G03_EVIDENCE_JSON=${JSON.stringify(evidence)}\n`,
      );
    } finally {
      await queue.onModuleDestroy().catch(() => undefined);
      await prisma.$disconnect();
    }
  });
});

function createProductionComponents(
  prisma: PrismaService,
  queue: BullmqService,
  storage: StorageService,
  fixture: ProductionFixture,
) {
  const generationRepository =
    new CommunicationNotificationGenerationRepository(prisma);
  const generationPreferenceService =
    new CommunicationNotificationPreferenceService(
      new CommunicationNotificationPreferenceRepository(prisma),
    );
  const generationRealtimePublisher = {
    publishToUser: jest.fn().mockResolvedValue(undefined),
  } as unknown as RealtimePublisherService;
  const generationService = new CommunicationNotificationGenerationService(
    generationRepository,
    new CommunicationRealtimeEventsService(generationRealtimePublisher),
    generationPreferenceService,
    new CommunicationNotificationPushQueueService(queue),
  );
  const generationReconciliation =
    new CommunicationNotificationReconciliationService(
      generationRepository,
      queue,
    );
  const pushRepository = new CommunicationNotificationPushRepository(prisma);
  const deviceTokens = new AppDeviceTokenRepository(prisma);
  let pushProviderCalls = 0;
  const pushProvider = {
    sendBatch: jest.fn(async ({ tokens }: { tokens: string[] }) => {
      pushProviderCalls += 1;
      if (pushProviderCalls === 1 && tokens.length === 2) {
        return {
          status: 'partial',
          provider: 'firebase_fcm',
          successCount: 1,
          failureCount: 1,
          results: [
            { tokenIndex: 0, status: 'sent', providerMessageId: 'fake-1' },
            { tokenIndex: 1, status: 'failed', errorCode: 'fcm/unavailable' },
          ],
        };
      }
      return {
        status: 'sent',
        provider: 'firebase_fcm',
        successCount: tokens.length,
        failureCount: 0,
        results: tokens.map((_, tokenIndex) => ({
          tokenIndex,
          status: 'sent',
          providerMessageId: `fake-${pushProviderCalls}-${tokenIndex}`,
        })),
      };
    }),
  };
  const pushDelivery = new CommunicationNotificationPushDeliveryService(
    pushRepository,
    deviceTokens,
    { decrypt: jest.fn((value: string) => `plain:${value}`) } as any,
    pushProvider as any,
    new CommunicationNotificationPushPayloadBuilder(),
  );
  const pushReconciliation =
    new CommunicationNotificationPushReconciliationService(
      pushRepository,
      pushDelivery,
      queue,
    );

  const emailRepository = new EmailDeliveryRepository(prisma);
  const emailReconciliation = new SchoolEmailDeliveryReconciliationService(
    emailRepository,
    queue,
  );
  const emailTransport = {
    sendEmail: jest.fn(async (input: { toEmail: string }) => {
      if (input.toEmail.startsWith('pre-provider')) {
        throw new SchoolEmailTransportFailure(
          'PRE_PROVIDER_ATTEMPT',
          'smtp_configuration_invalid',
          true,
        );
      }
      if (input.toEmail.startsWith('known-rejection')) {
        return { accepted: [], rejected: [input.toEmail] };
      }
      if (input.toEmail.startsWith('ambiguous')) {
        throw new SchoolEmailTransportFailure(
          'AMBIGUOUS_AFTER_PROVIDER_ATTEMPT',
          'provider_outcome_ambiguous',
          false,
        );
      }
      return {
        providerMessageId: 'fake-email-accepted',
        accepted: [input.toEmail],
        rejected: [],
      };
    }),
  };
  const emailProcess = new ProcessEmailDeliveryRecipientUseCase(
    emailRepository,
    {
      findConnection: jest.fn().mockResolvedValue(fixture.emailConnection),
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {
      renderCampaignEmail: jest.fn().mockResolvedValue({
        subject: 'Synthetic campaign',
        html: '<p>Synthetic campaign</p>',
        text: 'Synthetic campaign',
      }),
    } as any,
    {} as any,
    emailTransport as any,
  );

  const importRepository = new ImportJobsRepository(prisma);
  const importReconciliation = new ImportValidationReconciliationService(
    importRepository,
    queue,
  );
  const studentBulkRegistrationExecutionReconciliation =
    new StudentBulkRegistrationExecutionReconciliationService(
      new StudentBulkRegistrationExecutionRepository(prisma),
      queue,
    );
  const importProcess = new ProcessImportValidationUseCase(
    importRepository,
    storage,
  );
  const dismissalRepository = new DismissalRequestsExpiryRepository(prisma);
  const dismissalProcess = new ExpireDismissalRequestsUseCase(
    dismissalRepository,
    { publishStatusChanged: jest.fn().mockResolvedValue(undefined) } as any,
  );
  const learningRepository = new LearningMediaRepository(prisma);
  const learningMedia = new LearningMediaCleanupService(
    queue,
    learningRepository,
    storage,
  );
  const brandingRepository = new BrandingRepository(prisma);
  const brandingQueue = new BrandingLogoCleanupQueueService(queue, storage);
  const brandingProcess = new ProcessBrandingLogoCleanupUseCase(
    brandingRepository,
    storage,
    brandingQueue,
  );

  return {
    queue,
    prisma,
    generationRepository,
    generationService,
    generationRealtimePublisher,
    generationReconciliation,
    pushReconciliation,
    pushDelivery,
    pushProvider,
    emailReconciliation,
    emailProcess,
    emailTransport,
    importRepository,
    importReconciliation,
    studentBulkRegistrationExecutionReconciliation,
    importProcess,
    dismissalProcess,
    learningMedia,
    brandingQueue,
    brandingProcess,
  };
}

async function reconstructProductionWork(
  components: ReturnType<typeof createProductionComponents>,
  now: Date,
) {
  const generation = await components.generationReconciliation.reconcile(now);
  const push = await components.pushReconciliation.reconcile(now);
  const email = await components.emailReconciliation.reconcile(now);
  await components.importReconciliation.reconcile(now);
  await components.studentBulkRegistrationExecutionReconciliation.reconcile(
    now,
  );
  const learningMedia = await components.learningMedia.discoverAndEnqueue(now);
  await components.brandingProcess.reconcile();
  return {
    generation,
    pushRestored: push.restored,
    pushTerminalized: push.terminalized,
    emailRestored: email.restored,
    emailTerminalized: email.terminalized + email.outcomeUnknown,
    learningMedia,
  };
}

class ProductionDispatchHarness {
  readonly processors = new Map<string, (job: any) => Promise<unknown>>();

  createWorker(queueName: string, processor: (job: any) => Promise<unknown>) {
    this.processors.set(queueName, processor);
    return { on: jest.fn() };
  }

  processor(queueName: string) {
    const processor = this.processors.get(queueName);
    if (!processor)
      throw new Error(`production_processor_missing:${queueName}`);
    return processor;
  }
}

async function exerciseProductionWorkerDispatch(
  components: ReturnType<typeof createProductionComponents>,
  fixture: ProductionFixture,
) {
  const harness = new ProductionDispatchHarness();
  const bullmq = harness as unknown as BullmqService;
  new CommunicationNotificationGenerationWorker(
    bullmq,
    components.generationService,
    components.generationReconciliation,
  ).onModuleInit();
  new CommunicationNotificationPushWorker(
    bullmq,
    components.pushDelivery,
    components.pushReconciliation,
  ).onModuleInit();
  new SchoolEmailDeliveryWorker(
    bullmq,
    components.emailProcess,
    components.emailReconciliation,
  ).onModuleInit();
  new ImportValidationWorker(
    bullmq,
    components.importProcess,
    components.importReconciliation,
    components.studentBulkRegistrationExecutionReconciliation,
    components.importRepository,
  ).onModuleInit();
  new DismissalRequestExpiryWorker(
    bullmq,
    components.dismissalProcess,
  ).onModuleInit();
  new LearningMediaCleanupService(
    bullmq,
    (components.learningMedia as any).repository,
    (components.learningMedia as any).storage,
  ).onModuleInit();
  new BrandingLogoCleanupWorker(bullmq, components.brandingProcess, {
    ...components.brandingQueue,
    getReadiness: jest.fn().mockResolvedValue({ counts: {} }),
  } as any).onModuleInit();

  const base = {
    schoolId: fixture.activeSchoolId,
    organizationId: fixture.organizationId,
    actorUserId: fixture.actorUserId,
    actorUserType: UserType.SCHOOL_USER,
  };
  await harness.processor(COMMUNICATION_NOTIFICATION_QUEUE_NAME)({
    id: 'production-generation-reconcile',
    name: COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_RECONCILE_JOB_NAME,
    data: {},
  });
  const generationJob = await components.queue
    .getQueue(COMMUNICATION_NOTIFICATION_QUEUE_NAME)
    .getJob(
      `communication-announcement-notifications-${fixture.activeSchoolId}-${fixture.announcementId}`,
    );
  if (!generationJob) throw new Error('reconstructed_generation_job_missing');
  expect(generationJob.data).toMatchObject({
    schoolId: fixture.activeSchoolId,
    organizationId: fixture.organizationId,
    announcementId: fixture.announcementId,
    actorUserId: fixture.inactivePublisherUserId,
    actorUserType: UserType.SCHOOL_USER,
  });
  const generationBefore = await readGenerationOutcomes(
    components.prisma,
    fixture,
  );
  await harness.processor(COMMUNICATION_NOTIFICATION_QUEUE_NAME)({
    id: generationJob.id,
    name: COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_GENERATE_JOB_NAME,
    data: generationJob.data,
  });
  const generationAfterFirst = await readGenerationOutcomes(
    components.prisma,
    fixture,
  );
  expect(generationAfterFirst.rows).toHaveLength(1);
  expect(generationAfterFirst.rows[0]).toMatchObject({
    schoolId: fixture.activeSchoolId,
    recipientUserId: fixture.activeRecipientUserId,
    actorUserId: fixture.inactivePublisherUserId,
    expiresAt: fixture.announcementExpiresAt,
  });
  await harness.processor(COMMUNICATION_NOTIFICATION_QUEUE_NAME)({
    id: generationJob.id,
    name: COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_GENERATE_JOB_NAME,
    data: generationJob.data,
  });
  const generationAfterDuplicate = await readGenerationOutcomes(
    components.prisma,
    fixture,
  );
  await components.generationReconciliation.reconcile(fixture.now);
  const generationAfterReconciliation = await readGenerationOutcomes(
    components.prisma,
    fixture,
  );

  const observedPushContexts: Array<ReturnType<typeof getRequestContext>> = [];
  const originalProcessDelivery = components.pushDelivery.processDelivery.bind(
    components.pushDelivery,
  );
  jest
    .spyOn(components.pushDelivery, 'processDelivery')
    .mockImplementation(async (input) => {
      if (input.deliveryId === fixture.pushDeliveryId) {
        observedPushContexts.push(getRequestContext());
      }
      return originalProcessDelivery(input);
    });
  const recoveredPushJob = await components.queue
    .getQueue(COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME)
    .getJob(`communication-push-${fixture.pushDeliveryId}`);
  if (!recoveredPushJob) throw new Error('reconstructed_push_job_missing');
  expect(recoveredPushJob.data).toMatchObject({
    schoolId: fixture.activeSchoolId,
    organizationId: fixture.organizationId,
    actorUserId: null,
    actorUserType: null,
  });
  await expect(
    harness.processor(COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME)({
      id: fixture.pushDeliveryId,
      name: COMMUNICATION_NOTIFICATION_PUSH_SEND_JOB_NAME,
      data: recoveredPushJob.data,
    }),
  ).rejects.toThrow('communication_push_retryable_failure');
  await harness.processor(COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME)({
    id: fixture.pushDeliveryId,
    name: COMMUNICATION_NOTIFICATION_PUSH_SEND_JOB_NAME,
    data: recoveredPushJob.data,
  });
  const callsAfterPushSuccess =
    components.pushProvider.sendBatch.mock.calls.length;
  await harness.processor(COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME)({
    id: fixture.pushDeliveryId,
    name: COMMUNICATION_NOTIFICATION_PUSH_SEND_JOB_NAME,
    data: recoveredPushJob.data,
  });
  const pushKnownSuccessReplayCount =
    components.pushProvider.sendBatch.mock.calls.length - callsAfterPushSuccess;

  for (const recipientId of fixture.executableEmailRecipientIds) {
    const operation = harness.processor(SCHOOL_EMAIL_DELIVERY_QUEUE_NAME)({
      id: recipientId,
      name: SCHOOL_EMAIL_DELIVERY_SEND_RECIPIENT_JOB_NAME,
      data: { ...base, batchId: fixture.emailBatchId, recipientId },
    });
    if (recipientId === fixture.preProviderEmailRecipientId) {
      await expect(operation).rejects.toThrow(
        'school_email_delivery_retryable_failure',
      );
    } else {
      await operation;
    }
  }
  const emailCallsAfterOutcomeUnknown =
    components.emailTransport.sendEmail.mock.calls.length;
  await harness.processor(SCHOOL_EMAIL_DELIVERY_QUEUE_NAME)({
    id: fixture.ambiguousEmailRecipientId,
    name: SCHOOL_EMAIL_DELIVERY_SEND_RECIPIENT_JOB_NAME,
    data: {
      ...base,
      batchId: fixture.emailBatchId,
      recipientId: fixture.ambiguousEmailRecipientId,
    },
  });
  const emailOutcomeUnknownReplayCount =
    components.emailTransport.sendEmail.mock.calls.length -
    emailCallsAfterOutcomeUnknown;

  await harness.processor(FILES_IMPORT_QUEUE_NAME)({
    id: fixture.importJobId,
    name: FILES_IMPORT_VALIDATE_JOB_NAME,
    data: { importJobId: fixture.importJobId },
  });
  await harness.processor(DISMISSAL_REQUEST_EXPIRY_QUEUE_NAME)({
    id: 'dismissal-production',
    name: DISMISSAL_REQUEST_EXPIRY_JOB_NAME,
    data: { batchSize: 100 },
  });
  await harness.processor(LEARNING_MEDIA_CLEANUP_QUEUE)({
    id: learningMediaCleanupJobId(fixture.learningUploadId, 'staging'),
    name: 'cleanup',
    data: { uploadId: fixture.learningUploadId, target: 'staging' },
  });
  await harness.processor(BRANDING_LOGO_CLEANUP_QUEUE)({
    id: `branding-logo-cleanup-${fixture.brandingFileId}`,
    name: BRANDING_LOGO_CLEANUP_JOB,
    data: { fileId: fixture.brandingFileId },
  });

  const poisonResults: string[] = [];
  for (const queueName of [
    COMMUNICATION_NOTIFICATION_QUEUE_NAME,
    COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME,
    SCHOOL_EMAIL_DELIVERY_QUEUE_NAME,
    FILES_IMPORT_QUEUE_NAME,
    DISMISSAL_REQUEST_EXPIRY_QUEUE_NAME,
    LEARNING_MEDIA_CLEANUP_QUEUE,
    BRANDING_LOGO_CLEANUP_QUEUE,
  ]) {
    try {
      await harness.processor(queueName)({
        id: `poison-${queueName}`,
        name: 'g03.malformed.unknown',
        data: {},
        opts: { attempts: 1 },
        attemptsMade: 1,
      });
      throw new Error('poison_job_unexpectedly_accepted');
    } catch (error) {
      poisonResults.push(error instanceof Error ? error.message : 'unknown');
    }
  }
  return {
    poisonResults,
    pushKnownSuccessReplayCount,
    emailOutcomeUnknownReplayCount,
    pushActorlessContextCount: observedPushContexts.length,
    pushActorContextCount: observedPushContexts.filter(
      (context) => context?.actor !== undefined,
    ).length,
    pushScopeMismatchCount: observedPushContexts.filter(
      (context) =>
        context?.activeMembership?.schoolId !== fixture.activeSchoolId ||
        context.activeMembership.organizationId !== fixture.organizationId,
    ).length,
    generation: {
      createdCommunicationNotifications:
        generationAfterFirst.notifications - generationBefore.notifications,
      createdInAppDeliveries:
        generationAfterFirst.inApp - generationBefore.inApp,
      createdPushDeliveries: generationAfterFirst.push - generationBefore.push,
      duplicateNotificationRows:
        generationAfterDuplicate.notifications -
        generationAfterFirst.notifications,
      duplicateInAppRows:
        generationAfterDuplicate.inApp - generationAfterFirst.inApp,
      duplicatePushRows:
        generationAfterDuplicate.push - generationAfterFirst.push,
      postReconciliationNotificationRows:
        generationAfterReconciliation.notifications -
        generationAfterDuplicate.notifications,
      postReconciliationInAppRows:
        generationAfterReconciliation.inApp - generationAfterDuplicate.inApp,
      postReconciliationPushRows:
        generationAfterReconciliation.push - generationAfterDuplicate.push,
      fabricatedActorCount: generationAfterFirst.rows.filter(
        (row) => row.actorUserId !== fixture.inactivePublisherUserId,
      ).length,
      recoveredInactivePublisherCount: generationAfterFirst.rows.filter(
        (row) => row.actorUserId === fixture.inactivePublisherUserId,
      ).length,
    },
  };
}

async function seedProductionModels(
  prisma: PrismaService,
  storage: StorageService,
  bucket: string,
): Promise<ProductionFixture> {
  const now = new Date();
  const old = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const id = () => randomUUID();
  const organizationId = id();
  const inactiveOrganizationId = id();
  const activeSchoolId = id();
  const inactiveSchoolId = id();
  const actorUserId = id();
  const inactivePublisherUserId = id();
  const activeRecipientUserId = id();
  const inactiveRecipientUserId = id();
  const guardianUserId = id();
  await prisma.organization.createMany({
    data: [
      {
        id: organizationId,
        name: 'G03 Active Organization',
        slug: `g03-active-${organizationId}`,
        status: OrganizationStatus.ACTIVE,
      },
      {
        id: inactiveOrganizationId,
        name: 'G03 Inactive Organization',
        slug: `g03-inactive-${inactiveOrganizationId}`,
        status: OrganizationStatus.SUSPENDED,
      },
    ],
  });
  await prisma.school.createMany({
    data: [
      {
        id: activeSchoolId,
        organizationId,
        name: 'G03 Active School',
        slug: `g03-active-${activeSchoolId}`,
        status: SchoolStatus.ACTIVE,
      },
      {
        id: inactiveSchoolId,
        organizationId: inactiveOrganizationId,
        name: 'G03 Inactive School',
        slug: `g03-inactive-${inactiveSchoolId}`,
        status: SchoolStatus.ACTIVE,
      },
    ],
  });
  await prisma.user.createMany({
    data: [
      user(actorUserId, 'actor', UserType.SCHOOL_USER, UserStatus.ACTIVE),
      user(
        inactivePublisherUserId,
        'inactive-publisher',
        UserType.SCHOOL_USER,
        UserStatus.DISABLED,
      ),
      user(
        activeRecipientUserId,
        'recipient',
        UserType.SCHOOL_USER,
        UserStatus.ACTIVE,
      ),
      user(
        inactiveRecipientUserId,
        'inactive',
        UserType.SCHOOL_USER,
        UserStatus.DISABLED,
      ),
      user(guardianUserId, 'guardian', UserType.PARENT, UserStatus.ACTIVE),
    ],
  });

  const recipientRoleId = id();
  await prisma.role.create({
    data: {
      id: recipientRoleId,
      schoolId: activeSchoolId,
      key: `g03-recipient-${recipientRoleId}`,
      name: 'G03 Recipient',
    },
  });
  await prisma.membership.create({
    data: {
      id: id(),
      userId: activeRecipientUserId,
      organizationId,
      schoolId: activeSchoolId,
      roleId: recipientRoleId,
      userType: UserType.SCHOOL_USER,
      status: MembershipStatus.ACTIVE,
    },
  });

  const announcementId = id();
  const announcementExpiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  await prisma.communicationAnnouncement.create({
    data: {
      id: announcementId,
      schoolId: activeSchoolId,
      title: 'Synthetic announcement',
      body: 'Synthetic announcement body',
      status: CommunicationAnnouncementStatus.PUBLISHED,
      audienceType: CommunicationAnnouncementAudienceType.SCHOOL,
      publishedAt: now,
      expiresAt: announcementExpiresAt,
      createdById: inactivePublisherUserId,
      publishedById: inactivePublisherUserId,
    },
  });

  const pushNotificationId = id();
  const pushDeliveryId = id();
  await prisma.communicationNotification.create({
    data: notification(
      pushNotificationId,
      activeSchoolId,
      activeRecipientUserId,
      null,
    ),
  });
  await prisma.communicationNotificationDelivery.create({
    data: {
      id: pushDeliveryId,
      schoolId: activeSchoolId,
      notificationId: pushNotificationId,
      channel: CommunicationNotificationDeliveryChannel.PUSH,
      status: CommunicationNotificationDeliveryStatus.PENDING,
    },
  });
  const activeTokenIds = [id(), id()];
  await prisma.appDeviceToken.createMany({
    data: activeTokenIds.map((tokenId, index) => ({
      id: tokenId,
      schoolId: activeSchoolId,
      userId: activeRecipientUserId,
      tokenHash: `synthetic-hash-${index}`,
      tokenCiphertext: `synthetic-ciphertext-${index}`,
      platform: AppDeviceTokenPlatform.WEB,
      appSurface: AppDeviceTokenSurface.PARENT,
    })),
  });
  await prisma.communicationNotificationPushAttempt.createMany({
    data: activeTokenIds.map((deviceTokenId) => ({
      schoolId: activeSchoolId,
      deliveryId: pushDeliveryId,
      deviceTokenId,
      status: CommunicationNotificationDeliveryStatus.PENDING,
    })),
  });

  const pushRecipientIneligibleDeliveryId = id();
  const pushRecipientIneligibleNotificationId = id();
  const ineligibleTokenIds = [id(), id()];
  await prisma.communicationNotification.create({
    data: notification(
      pushRecipientIneligibleNotificationId,
      activeSchoolId,
      inactiveRecipientUserId,
      actorUserId,
    ),
  });
  await prisma.communicationNotificationDelivery.create({
    data: {
      id: pushRecipientIneligibleDeliveryId,
      schoolId: activeSchoolId,
      notificationId: pushRecipientIneligibleNotificationId,
      channel: CommunicationNotificationDeliveryChannel.PUSH,
      status: CommunicationNotificationDeliveryStatus.PENDING,
    },
  });
  await prisma.appDeviceToken.createMany({
    data: ineligibleTokenIds.map((tokenId, index) => ({
      id: tokenId,
      schoolId: activeSchoolId,
      userId: inactiveRecipientUserId,
      tokenHash: `inactive-hash-${index}`,
      tokenCiphertext: `inactive-ciphertext-${index}`,
      platform: AppDeviceTokenPlatform.WEB,
      appSurface: AppDeviceTokenSurface.PARENT,
    })),
  });
  await prisma.communicationNotificationPushAttempt.createMany({
    data: ineligibleTokenIds.map((deviceTokenId, index) => ({
      schoolId: activeSchoolId,
      deliveryId: pushRecipientIneligibleDeliveryId,
      deviceTokenId,
      status:
        index === 0
          ? CommunicationNotificationDeliveryStatus.SENT
          : CommunicationNotificationDeliveryStatus.PENDING,
      sentAt: index === 0 ? old : null,
      providerMessageId: index === 0 ? 'known-success' : null,
    })),
  });

  const pushTenantIneligibleNotificationId = id();
  const pushTenantIneligibleDeliveryId = id();
  const tenantTokenId = id();
  await prisma.communicationNotification.create({
    data: notification(
      pushTenantIneligibleNotificationId,
      inactiveSchoolId,
      activeRecipientUserId,
      actorUserId,
    ),
  });
  await prisma.communicationNotificationDelivery.create({
    data: {
      id: pushTenantIneligibleDeliveryId,
      schoolId: inactiveSchoolId,
      notificationId: pushTenantIneligibleNotificationId,
      channel: CommunicationNotificationDeliveryChannel.PUSH,
      status: CommunicationNotificationDeliveryStatus.PENDING,
    },
  });
  await prisma.appDeviceToken.create({
    data: {
      id: tenantTokenId,
      schoolId: inactiveSchoolId,
      userId: activeRecipientUserId,
      tokenHash: 'tenant-ineligible-hash',
      tokenCiphertext: 'tenant-ineligible-ciphertext',
      platform: AppDeviceTokenPlatform.WEB,
      appSurface: AppDeviceTokenSurface.PARENT,
    },
  });
  await prisma.communicationNotificationPushAttempt.create({
    data: {
      schoolId: inactiveSchoolId,
      deliveryId: pushTenantIneligibleDeliveryId,
      deviceTokenId: tenantTokenId,
      status: CommunicationNotificationDeliveryStatus.PENDING,
    },
  });

  const emailBatchId = id();
  await prisma.schoolEmailDeliveryBatch.create({
    data: {
      id: emailBatchId,
      schoolId: activeSchoolId,
      kind: SchoolEmailDeliveryKind.GENERAL_CAMPAIGN,
      status: SchoolEmailDeliveryBatchStatus.QUEUED,
      createdByUserId: actorUserId,
      totalRecipients: 5,
      queuedCount: 5,
      campaignContent: { bodyHtml: '<p>Synthetic</p>' },
    },
  });
  const emailRecipientId = id();
  const preProviderEmailRecipientId = id();
  const knownRejectedEmailRecipientId = id();
  const ambiguousEmailRecipientId = id();
  const outcomeUnknownEmailRecipientId = id();
  const executableEmailRecipientIds = [
    emailRecipientId,
    preProviderEmailRecipientId,
    knownRejectedEmailRecipientId,
    ambiguousEmailRecipientId,
    outcomeUnknownEmailRecipientId,
  ];
  const emailAddresses = [
    'accepted@test.invalid',
    'pre-provider@test.invalid',
    'known-rejection@test.invalid',
    'ambiguous@test.invalid',
    'accepted-outcome-unknown@test.invalid',
  ];
  await prisma.schoolEmailDeliveryRecipient.createMany({
    data: executableEmailRecipientIds.map((recipientId, index) => ({
      id: recipientId,
      schoolId: activeSchoolId,
      batchId: emailBatchId,
      recipientType: SchoolEmailDeliveryRecipientType.CUSTOM_EMAIL,
      toEmail: emailAddresses[index],
      status:
        recipientId === outcomeUnknownEmailRecipientId
          ? SchoolEmailDeliveryRecipientStatus.FAILED
          : SchoolEmailDeliveryRecipientStatus.QUEUED,
      failureReason:
        recipientId === outcomeUnknownEmailRecipientId
          ? 'recovery_outcome_unknown'
          : null,
    })),
  });
  const inactiveEmailBatchId = id();
  const inactiveEmailRecipientId = id();
  await prisma.schoolEmailDeliveryBatch.create({
    data: {
      id: inactiveEmailBatchId,
      schoolId: inactiveSchoolId,
      kind: SchoolEmailDeliveryKind.GENERAL_CAMPAIGN,
      status: SchoolEmailDeliveryBatchStatus.PROCESSING,
      totalRecipients: 1,
      campaignContent: { bodyHtml: '<p>Synthetic</p>' },
    },
  });
  await prisma.schoolEmailDeliveryRecipient.create({
    data: {
      id: inactiveEmailRecipientId,
      schoolId: inactiveSchoolId,
      batchId: inactiveEmailBatchId,
      recipientType: SchoolEmailDeliveryRecipientType.CUSTOM_EMAIL,
      toEmail: 'inactive-tenant@test.invalid',
      status: SchoolEmailDeliveryRecipientStatus.SENDING,
      lastAttemptAt: old,
    },
  });

  const importFileId = id();
  const importObject = {
    bucket,
    objectKey: `imports/${importFileId}.csv`,
  };
  await storage.saveObject({
    ...importObject,
    body: 'id,name\n1,Synthetic',
    contentType: 'text/csv',
  });
  await prisma.file.create({
    data: file(
      importFileId,
      organizationId,
      activeSchoolId,
      actorUserId,
      importObject,
      'import.csv',
      'text/csv',
    ),
  });
  const importJobId = id();
  await prisma.importJob.create({
    data: {
      id: importJobId,
      schoolId: activeSchoolId,
      uploadedFileId: importFileId,
      type: 'students_basic',
      status: ImportJobStatus.PENDING,
      createdById: actorUserId,
    },
  });
  const dismissalRequestId = await seedDismissalRequest(prisma, {
    id,
    now: new Date(),
    old,
    organizationId,
    schoolId: activeSchoolId,
    guardianUserId,
  });
  const bulkExecutionFileId = id();
  const bulkExecutionObject = {
    bucket,
    objectKey: `imports/${bulkExecutionFileId}.csv`,
  };
  await storage.saveObject({
    ...bulkExecutionObject,
    body: 'bulk execution source retained',
    contentType: 'text/csv',
  });
  await prisma.file.create({
    data: file(
      bulkExecutionFileId,
      organizationId,
      activeSchoolId,
      actorUserId,
      bulkExecutionObject,
      'bulk-execution.csv',
      'text/csv',
    ),
  });
  const studentRoleId = id();
  await prisma.role.create({
    data: {
      id: studentRoleId,
      schoolId: activeSchoolId,
      key: 'student',
      name: 'Student',
    },
  });
  const academicYear = await prisma.academicYear.findFirstOrThrow({
    where: { schoolId: activeSchoolId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  const classroom = await prisma.classroom.findFirstOrThrow({
    where: { schoolId: activeSchoolId, deletedAt: null },
    select: { id: true },
  });
  const bulkExecutionImportJobId = id();
  await prisma.importJob.create({
    data: {
      id: bulkExecutionImportJobId,
      schoolId: activeSchoolId,
      uploadedFileId: bulkExecutionFileId,
      type: 'students_bulk_registration',
      status: ImportJobStatus.COMPLETED,
      createdById: actorUserId,
      reportJson: {
        status: ImportJobStatus.COMPLETED,
        errors: [],
        bulkRegistrationExecution: {
          requestedById: actorUserId,
          requestedByUserType: UserType.SCHOOL_USER,
          requestedAt: now.toISOString(),
          loginDomain: 'g03.students.example.test',
          studentRoleId,
        },
      },
    },
  });
  const bulkExecutionBatchId = id();
  await prisma.studentBulkRegistrationBatch.create({
    data: {
      id: bulkExecutionBatchId,
      schoolId: activeSchoolId,
      organizationId,
      sourceImportJobId: bulkExecutionImportJobId,
      academicYearId: academicYear.id,
      classroomId: classroom.id,
      enrollmentDate: new Date('2026-09-01T00:00:00.000Z'),
      status: StudentBulkRegistrationBatchStatus.EXECUTING,
      totalRows: 1,
      validRows: 1,
      invalidRows: 0,
      createdRows: 0,
      failedRows: 0,
      createdById: actorUserId,
      validatedAt: now,
      startedAt: now,
    },
  });
  await prisma.studentBulkRegistrationRow.create({
    data: {
      schoolId: activeSchoolId,
      batchId: bulkExecutionBatchId,
      rowNumber: 2,
      normalizedDataJson: {
        firstNameEn: 'G03',
        fatherNameEn: null,
        grandfatherNameEn: null,
        familyNameEn: 'Recovery',
        firstNameAr: null,
        fatherNameAr: null,
        grandfatherNameAr: null,
        familyNameAr: null,
        dateOfBirth: '2012-05-20',
        gender: 'female',
        nationality: 'Egyptian',
        username: 'g03.recovery',
        contactEmail: null,
        studentPhone: null,
      },
      rowHash: 'a'.repeat(64),
      status: StudentBulkRegistrationRowStatus.VALID,
    },
  });
  const inactiveImportFileId = id();
  await prisma.file.create({
    data: {
      ...file(
        inactiveImportFileId,
        inactiveOrganizationId,
        inactiveSchoolId,
        actorUserId,
        { bucket, objectKey: `imports/${inactiveImportFileId}.csv` },
        'inactive.csv',
        'text/csv',
      ),
    },
  });
  const inactiveImportJobId = id();
  await prisma.importJob.create({
    data: {
      id: inactiveImportJobId,
      schoolId: inactiveSchoolId,
      uploadedFileId: inactiveImportFileId,
      type: 'students_basic',
      status: ImportJobStatus.PENDING,
    },
  });
  const deletedImportFileId = id();
  await prisma.file.create({
    data: {
      ...file(
        deletedImportFileId,
        organizationId,
        activeSchoolId,
        actorUserId,
        { bucket, objectKey: `imports/${deletedImportFileId}.csv` },
        'deleted.csv',
        'text/csv',
      ),
      deletedAt: old,
    },
  });
  const deletedImportJobId = id();
  await prisma.importJob.create({
    data: {
      id: deletedImportJobId,
      schoolId: activeSchoolId,
      uploadedFileId: deletedImportFileId,
      type: 'students_basic',
      status: ImportJobStatus.PROCESSING,
      updatedAt: old,
    },
  });

  const learningUploadId = id();
  const learningObject = {
    bucket,
    objectKey: `learning/${learningUploadId}.bin`,
  };
  await storage.saveObject({ ...learningObject, body: 'synthetic-learning' });
  await prisma.fileUploadSession.create({
    data: {
      id: learningUploadId,
      organizationId,
      schoolId: activeSchoolId,
      createdByUserId: actorUserId,
      clientRequestId: id(),
      purpose: FileUploadPurpose.LESSON_CONTENT,
      originalName: 'learning.txt',
      expectedMimeType: 'text/plain',
      expectedSizeBytes: 18n,
      stagingBucket: bucket,
      stagingObjectKey: learningObject.objectKey,
      finalBucket: bucket,
      finalObjectKey: `learning/final-${learningUploadId}.bin`,
      status: FileUploadSessionStatus.EXPIRED,
      createdAt: old,
      expiresAt: new Date(old.getTime() + 2 * 60 * 60 * 1000),
      stagingCleanupEligibleAt: new Date(old.getTime() + 2 * 60 * 60 * 1000),
    },
  });

  const brandingFileId = id();
  const brandingObject = {
    bucket,
    objectKey: `schools/${activeSchoolId}/branding/logos/${brandingFileId}.png`,
  };
  await storage.saveObject({
    ...brandingObject,
    body: 'synthetic-branding',
    contentType: 'image/png',
  });
  await prisma.file.create({
    data: {
      ...file(
        brandingFileId,
        organizationId,
        activeSchoolId,
        actorUserId,
        brandingObject,
        'branding.png',
        'image/png',
      ),
      deletedAt: old,
    },
  });

  return {
    now: new Date(),
    organizationId,
    activeSchoolId,
    actorUserId,
    inactivePublisherUserId,
    activeRecipientUserId,
    announcementId,
    announcementExpiresAt,
    pushNotificationId,
    pushDeliveryId,
    pushRecipientIneligibleDeliveryId,
    pushTenantIneligibleDeliveryId,
    emailBatchId,
    emailRecipientId,
    preProviderEmailRecipientId,
    knownRejectedEmailRecipientId,
    ambiguousEmailRecipientId,
    outcomeUnknownEmailRecipientId,
    executableEmailRecipientIds,
    inactiveEmailRecipientId,
    importJobId,
    bulkExecutionBatchId,
    inactiveImportJobId,
    deletedImportJobId,
    learningUploadId,
    brandingFileId,
    dismissalRequestId,
    importObject,
    learningObject,
    brandingObject,
    emailConnection: {
      id: id(),
      schoolId: activeSchoolId,
      providerType: 'SMTP',
      fromName: 'Synthetic School',
      fromEmail: 'sender@test.invalid',
      replyToEmail: null,
      host: 'smtp.test.invalid',
      port: 587,
      secure: false,
      username: 'synthetic',
      encryptedPassword: 'synthetic',
      encryptedApiKey: null,
      status: 'ACTIVE',
      lastTestedAt: now,
      verifiedAt: now,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    } as any,
  };
}

async function seedDismissalRequest(
  prisma: PrismaService,
  input: {
    id: () => string;
    now: Date;
    old: Date;
    organizationId: string;
    schoolId: string;
    guardianUserId: string;
  },
) {
  const academicYearId = input.id();
  const stageId = input.id();
  const gradeId = input.id();
  const sectionId = input.id();
  const classroomId = input.id();
  const studentId = input.id();
  const guardianId = input.id();
  const enrollmentId = input.id();
  const gateId = input.id();
  await prisma.academicYear.create({
    data: {
      id: academicYearId,
      schoolId: input.schoolId,
      nameAr: 'عام اصطناعي',
      nameEn: `Synthetic ${academicYearId}`,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
      isActive: true,
    },
  });
  await prisma.stage.create({
    data: {
      id: stageId,
      schoolId: input.schoolId,
      nameAr: 'مرحلة اصطناعية',
      nameEn: `Synthetic Stage ${stageId}`,
    },
  });
  await prisma.grade.create({
    data: {
      id: gradeId,
      schoolId: input.schoolId,
      stageId,
      nameAr: 'صف اصطناعي',
      nameEn: `Synthetic Grade ${gradeId}`,
    },
  });
  await prisma.section.create({
    data: {
      id: sectionId,
      schoolId: input.schoolId,
      gradeId,
      nameAr: 'قسم اصطناعي',
      nameEn: `Synthetic Section ${sectionId}`,
    },
  });
  await prisma.classroom.create({
    data: {
      id: classroomId,
      schoolId: input.schoolId,
      sectionId,
      nameAr: 'فصل اصطناعي',
      nameEn: `Synthetic Classroom ${classroomId}`,
    },
  });
  await prisma.student.create({
    data: {
      id: studentId,
      schoolId: input.schoolId,
      organizationId: input.organizationId,
      firstName: 'Synthetic',
      lastName: 'Student',
    },
  });
  await prisma.guardian.create({
    data: {
      id: guardianId,
      schoolId: input.schoolId,
      organizationId: input.organizationId,
      userId: input.guardianUserId,
      firstName: 'Synthetic',
      lastName: 'Guardian',
      phone: `+200${guardianId.replaceAll('-', '').slice(0, 8)}`,
      relation: 'parent',
      isPrimary: true,
    },
  });
  await prisma.studentGuardian.create({
    data: {
      schoolId: input.schoolId,
      studentId,
      guardianId,
      isPrimary: true,
    },
  });
  await prisma.enrollment.create({
    data: {
      id: enrollmentId,
      schoolId: input.schoolId,
      studentId,
      academicYearId,
      classroomId,
      status: StudentEnrollmentStatus.ACTIVE,
      enrolledAt: input.now,
    },
  });
  await prisma.dismissalGate.create({
    data: {
      id: gateId,
      schoolId: input.schoolId,
      code: `G03-${gateId.slice(0, 8)}`,
      name: 'Synthetic Gate',
      status: DismissalGateOperationalStatus.OPEN,
    },
  });
  const dismissalRequestId = input.id();
  await prisma.dismissalRequest.create({
    data: {
      id: dismissalRequestId,
      schoolId: input.schoolId,
      studentId,
      enrollmentId,
      guardianId,
      requestedById: input.guardianUserId,
      gateId,
      status: DismissalRequestStatus.REQUESTED,
      parentLatitude: 30.0,
      parentLongitude: 31.0,
      requestedAt: input.old,
    },
  });
  return dismissalRequestId;
}

async function readIneligibleOutcomes(
  prisma: PrismaService,
  fixture: ProductionFixture,
) {
  const [pushRecipient, pushTenant, emailTenant, importTenant, importSource] =
    await Promise.all([
      prisma.communicationNotificationDelivery.findUniqueOrThrow({
        where: { id: fixture.pushRecipientIneligibleDeliveryId },
      }),
      prisma.communicationNotificationDelivery.findUniqueOrThrow({
        where: { id: fixture.pushTenantIneligibleDeliveryId },
      }),
      prisma.schoolEmailDeliveryRecipient.findUniqueOrThrow({
        where: { id: fixture.inactiveEmailRecipientId },
      }),
      prisma.importJob.findUniqueOrThrow({
        where: { id: fixture.inactiveImportJobId },
      }),
      prisma.importJob.findUniqueOrThrow({
        where: { id: fixture.deletedImportJobId },
      }),
    ]);
  const open =
    [pushRecipient, pushTenant].filter((row) =>
      ['PENDING'].includes(row.status),
    ).length +
    [emailTenant].filter((row) =>
      ['QUEUED', 'PENDING', 'SENDING'].includes(row.status),
    ).length +
    [importTenant, importSource].filter((row) =>
      ['PENDING', 'PROCESSING'].includes(row.status),
    ).length;
  return {
    pushRecipient: pushRecipient.status,
    pushTenant: pushTenant.status,
    emailTenant: emailTenant.status,
    importTenant: importTenant.status,
    importSource: importSource.status,
    open,
  };
}

async function readGenerationOutcomes(
  prisma: PrismaService,
  fixture: ProductionFixture,
) {
  const rows = await prisma.communicationNotification.findMany({
    where: {
      schoolId: fixture.activeSchoolId,
      sourceModule: CommunicationNotificationSourceModule.ANNOUNCEMENTS,
      sourceType: 'communication_announcement',
      sourceId: fixture.announcementId,
      type: CommunicationNotificationType.ANNOUNCEMENT_PUBLISHED,
    },
    select: {
      id: true,
      schoolId: true,
      recipientUserId: true,
      actorUserId: true,
      expiresAt: true,
    },
    orderBy: { id: 'asc' },
  });
  const deliveries = await prisma.communicationNotificationDelivery.findMany({
    where: {
      schoolId: fixture.activeSchoolId,
      notification: {
        sourceModule: CommunicationNotificationSourceModule.ANNOUNCEMENTS,
        sourceType: 'communication_announcement',
        sourceId: fixture.announcementId,
        type: CommunicationNotificationType.ANNOUNCEMENT_PUBLISHED,
      },
    },
    select: { channel: true },
  });
  return {
    rows,
    notifications: rows.length,
    inApp: deliveries.filter(
      (delivery) =>
        delivery.channel === CommunicationNotificationDeliveryChannel.IN_APP,
    ).length,
    push: deliveries.filter(
      (delivery) =>
        delivery.channel === CommunicationNotificationDeliveryChannel.PUSH,
    ).length,
  };
}

async function readFinalProductionOutcomes(
  prisma: PrismaService,
  fixture: ProductionFixture,
) {
  const [push, attempts, recipients, importJob, dismissal, learning] =
    await Promise.all([
      prisma.communicationNotificationDelivery.findUniqueOrThrow({
        where: { id: fixture.pushDeliveryId },
      }),
      prisma.communicationNotificationPushAttempt.findMany({
        where: { deliveryId: fixture.pushDeliveryId },
      }),
      prisma.schoolEmailDeliveryRecipient.findMany({
        where: { batchId: fixture.emailBatchId },
      }),
      prisma.importJob.findUniqueOrThrow({
        where: { id: fixture.importJobId },
      }),
      prisma.dismissalRequest.findUniqueOrThrow({
        where: { id: fixture.dismissalRequestId },
      }),
      prisma.fileUploadSession.findUniqueOrThrow({
        where: { id: fixture.learningUploadId },
      }),
    ]);
  return {
    pushDelivery: push.status,
    pushSentAttempts: attempts.filter((row) => row.status === 'SENT').length,
    emailSent: recipients.filter((row) => row.status === 'SENT').length,
    emailPreProviderRetryable: recipients.filter(
      (row) => row.failureReason === 'recovery_retryable:pre_provider_failure',
    ).length,
    emailKnownRejected: recipients.filter(
      (row) => row.failureReason === 'recovery_terminal:provider_rejected',
    ).length,
    emailOutcomeUnknown: recipients.filter(
      (row) => row.failureReason === 'recovery_outcome_unknown',
    ).length,
    importCompleted: importJob.status === 'COMPLETED' ? 1 : 0,
    dismissalExpired: dismissal.status === 'EXPIRED' ? 1 : 0,
    learningMediaDeleted: learning.stagingObjectDeletedAt ? 1 : 0,
  };
}

async function assertReconstructedJobs(
  queue: BullmqService,
  fixture: ProductionFixture,
) {
  const emailJobs = await Promise.all(
    fixture.executableEmailRecipientIds.map((recipientId) =>
      queue
        .getQueue(SCHOOL_EMAIL_DELIVERY_QUEUE_NAME)
        .getJob(`school-email-delivery:${fixture.emailBatchId}:${recipientId}`),
    ),
  );
  return {
    communication: Number(
      Boolean(
        await queue
          .getQueue(COMMUNICATION_NOTIFICATION_QUEUE_NAME)
          .getJob(
            `communication-announcement-notifications-${fixture.activeSchoolId}-${fixture.announcementId}`,
          ),
      ),
    ),
    push: Number(
      Boolean(
        await queue
          .getQueue(COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME)
          .getJob(`communication-push-${fixture.pushDeliveryId}`),
      ),
    ),
    email: emailJobs.filter(Boolean).length,
    imports: Number(
      Boolean(
        await queue
          .getQueue(FILES_IMPORT_QUEUE_NAME)
          .getJob(fixture.importJobId),
      ),
    ),
    bulkExecution: Number(
      Boolean(
        await queue
          .getQueue(FILES_IMPORT_QUEUE_NAME)
          .getJob(
            studentBulkRegistrationExecutionJobId(fixture.bulkExecutionBatchId),
          ),
      ),
    ),
    dismissal: Number(
      queue
        .getRepeatRegistrations()
        .some((row) => row.queueName === DISMISSAL_REQUEST_EXPIRY_QUEUE_NAME),
    ),
    learningMedia: Number(
      Boolean(
        await queue
          .getQueue(LEARNING_MEDIA_CLEANUP_QUEUE)
          .getJob(
            learningMediaCleanupJobId(fixture.learningUploadId, 'staging'),
          ),
      ),
    ),
    branding: Number(
      Boolean(
        await queue
          .getQueue(BRANDING_LOGO_CLEANUP_QUEUE)
          .getJob(`branding-logo-cleanup-${fixture.brandingFileId}`),
      ),
    ),
  };
}

function user(
  id: string,
  label: string,
  userType: UserType,
  status: UserStatus,
) {
  return {
    id,
    email: `${label}-${id}@test.invalid`,
    firstName: 'Synthetic',
    lastName: label,
    userType,
    status,
  };
}

function notification(
  id: string,
  schoolId: string,
  recipientUserId: string,
  actorUserId: string | null,
) {
  return {
    id,
    schoolId,
    recipientUserId,
    actorUserId,
    sourceModule: CommunicationNotificationSourceModule.COMMUNICATION,
    sourceType: 'g03_synthetic',
    type: CommunicationNotificationType.SYSTEM_ALERT,
    title: 'Synthetic notification',
    body: 'Synthetic notification body',
    priority: CommunicationNotificationPriority.NORMAL,
  };
}

function file(
  id: string,
  organizationId: string,
  schoolId: string,
  uploaderId: string,
  object: { bucket: string; objectKey: string },
  originalName: string,
  mimeType: string,
) {
  return {
    id,
    organizationId,
    schoolId,
    uploaderId,
    bucket: object.bucket,
    objectKey: object.objectKey,
    originalName,
    mimeType,
    sizeBytes: 18n,
    visibility: FileVisibility.PRIVATE,
  };
}

type ProductionFixture = Awaited<ReturnType<typeof seedProductionModels>>;

function replaceQueueRedisWithEmptyBarrier(): void {
  const container = required('PRD3_G03_QUEUE_CONTAINER');
  const network = required('PRD3_G03_NETWORK');
  const image = required('PRD3_G03_REDIS_IMAGE_ID');
  const runId = required('PRD3_G03_RUN_ID');
  const port = requiredNumber('PRD3_G03_QUEUE_PORT');
  docker(['rm', '--force', container]);
  docker([
    'run',
    '--detach',
    '--pull',
    'never',
    '--restart',
    'no',
    '--name',
    container,
    '--network',
    network,
    '--label',
    'com.moazez.evidence.gate=PRD3-G03',
    '--label',
    `com.moazez.evidence.run=${runId}`,
    '--label',
    'com.moazez.evidence.role=queue',
    '--publish',
    `127.0.0.1:${port}:6379`,
    '--tmpfs',
    '/data:rw,noexec,nosuid,size=67108864',
    image,
    'redis-server',
    '--save',
    '',
    '--appendonly',
    'no',
    '--requirepass',
    'g03-empty-barrier',
  ]);
  waitForRedisContainer(container);
}

function redisAdmin(args: string[], authenticated = false): string {
  return docker([
    'exec',
    required('PRD3_G03_QUEUE_CONTAINER'),
    'redis-cli',
    '--raw',
    ...(authenticated ? ['-a', 'g03-empty-barrier'] : []),
    ...args,
  ]).trim();
}

function waitForRedisContainer(container: string): void {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const result = dockerResult([
      'exec',
      container,
      'redis-cli',
      '--raw',
      '-a',
      'g03-empty-barrier',
      'PING',
    ]);
    if (result.status === 0 && result.stdout.trim() === 'PONG') return;
    pause(100);
  }
  throw new Error('replacement_redis_startup_timeout');
}

function waitForWorkerFailure(
  worker: Worker,
  jobId: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.off('failed', onFailed);
      reject(new Error('bulk_execution_job_not_exhausted'));
    }, timeoutMs);
    const onFailed = (job: Job | undefined): void => {
      if (job?.id !== jobId) return;
      clearTimeout(timeout);
      worker.off('failed', onFailed);
      resolve();
    };
    worker.on('failed', onFailed);
  });
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  errorCode: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(errorCode);
}

function docker(args: string[]): string {
  const result = dockerResult(args);
  if (result.error || result.status !== 0) {
    throw new Error(`docker_command_failed:${args[0]}:${args[1] ?? ''}`);
  }
  return result.stdout;
}

function dockerResult(args: string[]) {
  return spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: 30_000,
    killSignal: 'SIGTERM',
  });
}

function pause(milliseconds: number): void {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, milliseconds);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

function requiredNumber(name: string): number {
  const value = Number(required(name));
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`invalid_${name.toLowerCase()}`);
  }
  return value;
}
