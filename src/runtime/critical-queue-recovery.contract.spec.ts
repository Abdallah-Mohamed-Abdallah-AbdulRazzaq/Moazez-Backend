import {
  CommunicationNotificationDeliveryStatus,
  DismissalRequestStatus,
  ImportJobStatus,
  SchoolEmailDeliveryRecipientStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { CommunicationNotificationReconciliationService } from '../modules/communication/application/communication-notification-reconciliation.service';
import { CommunicationNotificationPushReconciliationService } from '../modules/communication/application/communication-notification-push-reconciliation.service';
import { CommunicationNotificationPushDeliveryService } from '../modules/communication/application/communication-notification-push-delivery.service';
import { CommunicationNotificationGenerationWorker } from '../modules/communication/infrastructure/communication-notification-generation.worker';
import { CommunicationNotificationGenerationRepository } from '../modules/communication/infrastructure/communication-notification-generation.repository';
import { CommunicationNotificationPushRepository } from '../modules/communication/infrastructure/communication-notification-push.repository';
import { CommunicationNotificationPushWorker } from '../modules/communication/infrastructure/communication-notification-push.worker';
import {
  COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_GENERATE_JOB_NAME,
  COMMUNICATION_NOTIFICATION_QUEUE_NAME,
  COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME,
  COMMUNICATION_NOTIFICATION_PUSH_SEND_JOB_NAME,
} from '../modules/communication/domain/communication-notification-generation-domain';
import { ExpireDismissalRequestsUseCase } from '../modules/dismissal/requests/application/expire-dismissal-requests.use-case';
import { DismissalRequestsExpiryRepository } from '../modules/dismissal/requests/infrastructure/dismissal-requests-expiry.repository';
import { DismissalRealtimeEventsService } from '../modules/dismissal/realtime/dismissal-realtime-events.service';
import { ImportValidationReconciliationService } from '../modules/files/imports/application/import-validation-reconciliation.service';
import { ProcessImportValidationUseCase } from '../modules/files/imports/application/process-import-validation.use-case';
import { readImportJobRecovery } from '../modules/files/imports/domain/import-job.report';
import { ImportJobsRepository } from '../modules/files/imports/infrastructure/import-jobs.repository';
import { BullmqService } from '../infrastructure/queue/bullmq.service';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { StorageService } from '../infrastructure/storage/storage.service';
import { ObjectStorageError } from '../infrastructure/storage/object-storage.errors';
import { getRequestContext } from '../common/context/request-context';
import { SchoolEmailDeliveryReconciliationService } from '../modules/settings/email/delivery/application/school-email-delivery-reconciliation.service';
import { EmailDeliveryRepository } from '../modules/settings/email/delivery/infrastructure/email-delivery.repository';

const NOW = new Date('2026-08-06T08:00:00.000Z');

describe('critical queue persisted-truth reconciliation', () => {
  it('recovers inactive, soft-deleted, and absent announcement actors without fabrication', async () => {
    const publishedAt = new Date('2026-08-06T07:00:00.000Z');
    const repository = new CommunicationNotificationGenerationRepository({
      communicationAnnouncement: {
        findMany: jest.fn().mockResolvedValue([
          recoveryAnnouncementRow({
            id: 'inactive-publisher',
            publishedAt,
            publishedBy: {
              id: 'publisher-inactive',
              userType: UserType.SCHOOL_USER,
              status: UserStatus.DISABLED,
              deletedAt: null,
            },
          }),
          recoveryAnnouncementRow({
            id: 'deleted-publisher',
            publishedAt,
            publishedBy: {
              id: 'publisher-deleted',
              userType: UserType.SCHOOL_USER,
              status: UserStatus.ACTIVE,
              deletedAt: new Date('2026-08-06T06:00:00.000Z'),
            },
          }),
          recoveryAnnouncementRow({
            id: 'no-actor',
            publishedAt,
            publishedBy: null,
            createdBy: null,
          }),
        ]),
      },
    } as unknown as PrismaService);

    await expect(
      repository.listPublishedAnnouncementRecoveryCandidates({
        now: NOW,
        windowStartedAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
        take: 100,
      }),
    ).resolves.toEqual({
      candidates: [
        expect.objectContaining({
          id: 'inactive-publisher',
          actorUserId: 'publisher-inactive',
          actorUserType: UserType.SCHOOL_USER,
        }),
        expect.objectContaining({
          id: 'deleted-publisher',
          actorUserId: 'publisher-deleted',
          actorUserType: UserType.SCHOOL_USER,
        }),
        expect.objectContaining({
          id: 'no-actor',
          actorUserId: null,
          actorUserType: null,
        }),
      ],
      next: null,
    });
  });

  it('reconstructs missed communication generation jobs in bounded pages', async () => {
    const repository = {
      listPublishedAnnouncementRecoveryCandidates: jest
        .fn()
        .mockResolvedValueOnce({
          candidates: [
            {
              id: 'announcement-1',
              schoolId: 'school-1',
              organizationId: 'org-1',
              publishedAt: NOW,
              actorUserId: '11111111-1111-4111-8111-111111111111',
              actorUserType: UserType.SCHOOL_USER,
            },
          ],
          next: null,
        }),
    } as unknown as CommunicationNotificationGenerationRepository;
    const queue = queueMock();
    const service = new CommunicationNotificationReconciliationService(
      repository,
      queue,
    );

    await expect(service.reconcile(NOW)).resolves.toBe(1);
    expect(
      repository.listPublishedAnnouncementRecoveryCandidates,
    ).toHaveBeenCalledWith({
      now: NOW,
      windowStartedAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
      after: undefined,
      take: 100,
    });
    expect(queue.ensureJobFromPersistedTruth).toHaveBeenCalledWith(
      'communication-notifications',
      'communication.announcement.notifications.generate',
      expect.objectContaining({
        announcementId: 'announcement-1',
        organizationId: 'org-1',
        actorUserId: '11111111-1111-4111-8111-111111111111',
      }),
      expect.objectContaining({
        jobId:
          'communication-announcement-notifications-school-1-announcement-1',
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      }),
    );
  });

  it('reconstructs push work only from eligible persisted delivery context', async () => {
    const candidate = {
      id: 'delivery-1',
      notificationId: 'notification-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      actorUserId: '11111111-1111-4111-8111-111111111111',
      actorUserType: UserType.SCHOOL_USER,
      ineligibilityCode: null,
      createdAt: NOW,
    };
    const repository = {
      listPushRecoveryCandidates: jest.fn((input) =>
        Promise.resolve(input.expired ? [] : [candidate]),
      ),
    } as unknown as CommunicationNotificationPushRepository;
    const delivery = {
      expireRecoveryWindow: jest.fn(),
    } as unknown as CommunicationNotificationPushDeliveryService;
    const queue = queueMock();
    const service = new CommunicationNotificationPushReconciliationService(
      repository,
      delivery,
      queue,
    );

    await expect(service.reconcile(NOW)).resolves.toEqual({
      restored: 1,
      terminalized: 0,
    });
    expect(queue.ensureJobFromPersistedTruth).toHaveBeenCalledWith(
      'communication-notification-push',
      'communication.notification.push.send',
      expect.objectContaining({ deliveryId: 'delivery-1' }),
      expect.objectContaining({ jobId: 'communication-push-delivery-1' }),
    );
  });

  it.each([
    {
      label: 'missing actor ID',
      actorUserId: null,
      actorUserType: UserType.SCHOOL_USER,
    },
    {
      label: 'missing actor type',
      actorUserId: '11111111-1111-4111-8111-111111111111',
      actorUserType: null,
    },
  ])(
    'reconstructs eligible Push work with $label',
    async ({ label: _label, ...actor }) => {
      const candidate = {
        id: 'delivery-actorless',
        notificationId: 'notification-actorless',
        schoolId: 'school-1',
        organizationId: 'org-1',
        ...actor,
        ineligibilityCode: null,
        createdAt: NOW,
      };
      const repository = {
        listPushRecoveryCandidates: jest.fn((input) =>
          Promise.resolve(input.expired ? [] : [candidate]),
        ),
      } as unknown as CommunicationNotificationPushRepository;
      const delivery = {
        expireRecoveryWindow: jest.fn(),
      } as unknown as CommunicationNotificationPushDeliveryService;
      const queue = queueMock();
      const service = new CommunicationNotificationPushReconciliationService(
        repository,
        delivery,
        queue,
      );

      await expect(service.reconcile(NOW)).resolves.toEqual({
        restored: 1,
        terminalized: 0,
      });
      expect(queue.ensureJobFromPersistedTruth).toHaveBeenCalledWith(
        COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME,
        COMMUNICATION_NOTIFICATION_PUSH_SEND_JOB_NAME,
        expect.objectContaining(actor),
        expect.any(Object),
      );
    },
  );

  it.each([
    {
      label: 'missing actor ID',
      actorUserId: null,
      actorUserType: UserType.SCHOOL_USER,
    },
    {
      label: 'missing actor type',
      actorUserId: '11111111-1111-4111-8111-111111111111',
      actorUserType: null,
    },
  ])(
    'Push Worker omits actor for $label and retains tenant scope',
    async ({ label: _label, ...actor }) => {
      let processor: ((job: any) => Promise<void>) | undefined;
      const bullmq = {
        createWorker: jest.fn((_queueName, registeredProcessor) => {
          processor = registeredProcessor;
          return { on: jest.fn() };
        }),
      } as unknown as BullmqService;
      const observedContexts: Array<ReturnType<typeof getRequestContext>> = [];
      const delivery = {
        processDelivery: jest.fn().mockImplementation(async () => {
          observedContexts.push(getRequestContext());
        }),
      } as unknown as CommunicationNotificationPushDeliveryService;
      new CommunicationNotificationPushWorker(
        bullmq,
        delivery,
        {} as CommunicationNotificationPushReconciliationService,
      ).onModuleInit();

      await processor?.({
        id: 'push-actorless',
        name: COMMUNICATION_NOTIFICATION_PUSH_SEND_JOB_NAME,
        data: {
          schoolId: 'school-1',
          organizationId: 'org-1',
          notificationId: 'notification-actorless',
          deliveryId: 'delivery-actorless',
          ...actor,
        },
      });

      expect(delivery.processDelivery).toHaveBeenCalledWith({
        schoolId: 'school-1',
        deliveryId: 'delivery-actorless',
      });
      expect(observedContexts).toHaveLength(1);
      expect(observedContexts[0]?.actor).toBeUndefined();
      expect(observedContexts[0]?.activeMembership).toEqual(
        expect.objectContaining({
          organizationId: 'org-1',
          schoolId: 'school-1',
        }),
      );
    },
  );

  it('Generation Worker omits actor when persisted actor fields are absent', async () => {
    let processor: ((job: any) => Promise<void>) | undefined;
    const bullmq = {
      createWorker: jest.fn((_queueName, registeredProcessor) => {
        processor = registeredProcessor;
        return { on: jest.fn() };
      }),
    } as unknown as BullmqService;
    const observedContexts: Array<ReturnType<typeof getRequestContext>> = [];
    const generation = {
      generateForPublishedAnnouncement: jest
        .fn()
        .mockImplementation(async () => {
          observedContexts.push(getRequestContext());
        }),
    };
    new CommunicationNotificationGenerationWorker(
      bullmq,
      generation as any,
      {} as CommunicationNotificationReconciliationService,
    ).onModuleInit();

    await processor?.({
      id: 'generation-actorless',
      name: COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_GENERATE_JOB_NAME,
      data: {
        schoolId: 'school-1',
        organizationId: 'org-1',
        announcementId: 'announcement-actorless',
        actorUserId: null,
        actorUserType: null,
      },
    });

    expect(bullmq.createWorker).toHaveBeenCalledWith(
      COMMUNICATION_NOTIFICATION_QUEUE_NAME,
      expect.any(Function),
    );
    expect(observedContexts[0]?.actor).toBeUndefined();
    expect(observedContexts[0]?.activeMembership).toEqual(
      expect.objectContaining({
        organizationId: 'org-1',
        schoolId: 'school-1',
      }),
    );
  });

  it('terminalizes an ineligible push recipient without enqueue or replay', async () => {
    const candidate = {
      id: 'delivery-ineligible',
      notificationId: 'notification-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      actorUserId: null,
      actorUserType: null,
      ineligibilityCode: 'push/recipient-ineligible' as const,
      createdAt: NOW,
    };
    const repository = {
      listPushRecoveryCandidates: jest.fn((input) =>
        Promise.resolve(input.expired ? [] : [candidate]),
      ),
    } as unknown as CommunicationNotificationPushRepository;
    const delivery = {
      terminalizeRecovery: jest.fn().mockResolvedValue(undefined),
    } as unknown as CommunicationNotificationPushDeliveryService;
    const queue = queueMock();
    const service = new CommunicationNotificationPushReconciliationService(
      repository,
      delivery,
      queue,
    );

    await expect(service.reconcile(NOW)).resolves.toEqual({
      restored: 0,
      terminalized: 1,
    });
    expect(delivery.terminalizeRecovery).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'push/recipient-ineligible' }),
    );
    expect(queue.ensureJobFromPersistedTruth).not.toHaveBeenCalled();
  });

  it('classifies stale email SENDING as outcome_unknown and never enqueues it', async () => {
    const stale = emailCandidate(SchoolEmailDeliveryRecipientStatus.SENDING);
    const repository = {
      listStaleSendingRecoveryCandidates: jest
        .fn()
        .mockResolvedValueOnce([stale])
        .mockResolvedValueOnce([]),
      listRecoveryCandidates: jest.fn().mockResolvedValue([]),
      markRecipientFailed: jest.fn().mockResolvedValue(undefined),
      refreshBatchStatus: jest.fn().mockResolvedValue(undefined),
    } as unknown as EmailDeliveryRepository;
    const queue = queueMock();
    const service = new SchoolEmailDeliveryReconciliationService(
      repository,
      queue,
    );

    await expect(service.reconcile(NOW)).resolves.toEqual({
      restored: 0,
      outcomeUnknown: 1,
      terminalized: 0,
    });
    expect(repository.markRecipientFailed).toHaveBeenCalledWith({
      recipientId: 'recipient-1',
      failureReason: 'recovery_outcome_unknown',
    });
    expect(repository.refreshBatchStatus).toHaveBeenCalledWith('batch-1');
    expect(queue.ensureJobFromPersistedTruth).not.toHaveBeenCalled();
  });

  it('terminalizes unresolved email work at the exact 72-hour boundary', async () => {
    const expiredCandidate = {
      ...emailCandidate(SchoolEmailDeliveryRecipientStatus.QUEUED),
      createdAt: new Date(NOW.getTime() - 72 * 60 * 60 * 1000),
    };
    let expiredReads = 0;
    const repository = {
      listStaleSendingRecoveryCandidates: jest.fn().mockResolvedValue([]),
      listRecoveryCandidates: jest.fn((input) => {
        if (!input.expired) return Promise.resolve([]);
        expiredReads += 1;
        return Promise.resolve(expiredReads === 1 ? [expiredCandidate] : []);
      }),
      markRecipientFailed: jest.fn().mockResolvedValue(undefined),
      refreshBatchStatus: jest.fn().mockResolvedValue(undefined),
    } as unknown as EmailDeliveryRepository;
    const queue = queueMock();
    const service = new SchoolEmailDeliveryReconciliationService(
      repository,
      queue,
    );

    await expect(service.reconcile(NOW)).resolves.toEqual({
      restored: 0,
      outcomeUnknown: 0,
      terminalized: 1,
    });
    expect(repository.markRecipientFailed).toHaveBeenCalledWith({
      recipientId: 'recipient-1',
      failureReason: 'recovery_terminal_window_expired',
    });
    expect(queue.ensureJobFromPersistedTruth).not.toHaveBeenCalled();
  });

  it('terminalizes stale ineligible email work without fabricating an actor', async () => {
    const stale = {
      ...emailCandidate(SchoolEmailDeliveryRecipientStatus.SENDING),
      actorUserId: null,
      actorUserType: null,
      ineligibilityReason: 'recovery_terminal:tenant_ineligible' as const,
    };
    const observedActors: unknown[] = [];
    const repository = {
      listStaleSendingRecoveryCandidates: jest
        .fn()
        .mockResolvedValueOnce([stale])
        .mockResolvedValueOnce([]),
      listRecoveryCandidates: jest.fn().mockResolvedValue([]),
      markRecipientFailed: jest.fn().mockImplementation(async () => {
        observedActors.push(getRequestContext()?.actor);
      }),
      refreshBatchStatus: jest.fn().mockResolvedValue(undefined),
    } as unknown as EmailDeliveryRepository;
    const queue = queueMock();
    const service = new SchoolEmailDeliveryReconciliationService(
      repository,
      queue,
    );

    await service.reconcile(NOW);
    expect(repository.markRecipientFailed).toHaveBeenCalledWith({
      recipientId: 'recipient-1',
      failureReason: 'recovery_terminal:tenant_ineligible',
    });
    expect(observedActors).toEqual([undefined]);
    expect(queue.ensureJobFromPersistedTruth).not.toHaveBeenCalled();
  });

  it('terminalizes an import at the exact 24-hour recovery boundary', async () => {
    const candidate = importRecord({
      status: ImportJobStatus.PENDING,
      createdAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000),
    });
    const repository = {
      listRecoveryCandidates: jest
        .fn()
        .mockResolvedValueOnce([candidate])
        .mockResolvedValueOnce([]),
      updateImportJob: jest.fn().mockResolvedValue(candidate),
    } as unknown as ImportJobsRepository;
    const queue = queueMock();
    const service = new ImportValidationReconciliationService(
      repository,
      queue,
    );

    await service.reconcile(NOW);
    expect(repository.updateImportJob).toHaveBeenCalledWith(
      expect.objectContaining({
        importJobId: 'import-1',
        status: ImportJobStatus.FAILED,
        reportJson: expect.objectContaining({
          recovery: {
            classification: 'terminal',
            code: 'import_terminal_recovery_window_expired',
          },
        }),
      }),
    );
    expect(queue.ensureJobFromPersistedTruth).not.toHaveBeenCalled();
  });

  it('re-enqueues stale import PROCESSING while the lease and window permit it', async () => {
    const candidate = importRecord({
      status: ImportJobStatus.PROCESSING,
      updatedAt: new Date(NOW.getTime() - 5 * 60 * 1000),
    });
    const repository = {
      listRecoveryCandidates: jest
        .fn()
        .mockResolvedValueOnce([candidate])
        .mockResolvedValueOnce([]),
      updateImportJob: jest.fn(),
    } as unknown as ImportJobsRepository;
    const queue = queueMock();
    const service = new ImportValidationReconciliationService(
      repository,
      queue,
    );

    await service.reconcile(NOW);
    expect(queue.ensureJobFromPersistedTruth).toHaveBeenCalledWith(
      'files-imports',
      'validate-import',
      { importJobId: 'import-1' },
      expect.objectContaining({
        jobId: 'import-1',
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      }),
    );
  });

  it('terminalizes an ineligible import source without enqueueing validation', async () => {
    const candidate = importRecord({
      ineligibilityCode: 'import_terminal_source_ineligible',
    });
    const repository = {
      listRecoveryCandidates: jest
        .fn()
        .mockResolvedValueOnce([candidate])
        .mockResolvedValueOnce([]),
      updateImportJob: jest.fn().mockResolvedValue(candidate),
    } as unknown as ImportJobsRepository;
    const queue = queueMock();
    const service = new ImportValidationReconciliationService(
      repository,
      queue,
    );

    await service.reconcile(NOW);
    expect(repository.updateImportJob).toHaveBeenCalledWith(
      expect.objectContaining({
        importJobId: 'import-1',
        reportJson: expect.objectContaining({
          recovery: {
            classification: 'terminal',
            code: 'import_terminal_source_ineligible',
          },
        }),
      }),
    );
    expect(queue.ensureJobFromPersistedTruth).not.toHaveBeenCalled();
  });
});

describe('import validation retry and terminal policy', () => {
  it('persists transient storage failure as retryable and throws a sanitized error', async () => {
    const record = importRecord({ status: ImportJobStatus.PENDING });
    const repository = importRepositoryMock(record);
    const storage = {
      statObject: jest
        .fn()
        .mockRejectedValue(
          new Error('provider endpoint contained sensitive detail'),
        ),
    } as unknown as StorageService;
    const service = new ProcessImportValidationUseCase(repository, storage);

    await expect(service.execute(record.id)).rejects.toThrow(
      'import_validation_retryable_failure',
    );
    const update = (repository.updateImportJob as jest.Mock).mock.calls.at(
      -1,
    )[0];
    expect(readImportJobRecovery(update.reportJson)).toEqual({
      classification: 'retryable',
      code: 'import_recovery_storage_unavailable',
    });
    expect(JSON.stringify(update)).not.toContain('sensitive detail');
  });

  it('persists confirmed object absence as terminal without a BullMQ retry', async () => {
    const record = importRecord({ status: ImportJobStatus.PENDING });
    const repository = importRepositoryMock(record);
    const storage = {
      statObject: jest
        .fn()
        .mockRejectedValue(new ObjectStorageError('not_found')),
    } as unknown as StorageService;
    const service = new ProcessImportValidationUseCase(repository, storage);

    await expect(service.execute(record.id)).resolves.toBeUndefined();
    const update = (repository.updateImportJob as jest.Mock).mock.calls.at(
      -1,
    )[0];
    expect(readImportJobRecovery(update.reportJson)).toEqual({
      classification: 'terminal',
      code: 'import_terminal_object_missing',
    });
  });
});

describe('dismissal expiry partial-failure isolation', () => {
  const candidates = [
    dismissalCandidate('request-1'),
    dismissalCandidate('request-2'),
  ];

  it('continues independent mutations then throws one sanitized aggregate error', async () => {
    const repository = {
      listExpiredCandidates: jest.fn().mockResolvedValue(candidates),
      expireCandidate: jest
        .fn()
        .mockRejectedValueOnce(new Error('database detail'))
        .mockResolvedValueOnce(expired('request-2')),
    } as unknown as DismissalRequestsExpiryRepository;
    const realtime = {
      publishStatusChanged: jest.fn().mockResolvedValue(undefined),
    } as unknown as DismissalRealtimeEventsService;
    const service = new ExpireDismissalRequestsUseCase(repository, realtime);

    await expect(service.runOnce({ now: NOW })).rejects.toThrow(
      'dismissal_expiry_batch_mutation_failed',
    );
    expect(repository.expireCandidate).toHaveBeenCalledTimes(2);
    expect(realtime.publishStatusChanged).toHaveBeenCalledTimes(1);
  });

  it('does not retry a committed mutation only because realtime publication failed', async () => {
    const repository = {
      listExpiredCandidates: jest.fn().mockResolvedValue([candidates[0]]),
      expireCandidate: jest.fn().mockResolvedValue(expired('request-1')),
    } as unknown as DismissalRequestsExpiryRepository;
    const realtime = {
      publishStatusChanged: jest.fn().mockRejectedValue(new Error('offline')),
    } as unknown as DismissalRealtimeEventsService;
    const service = new ExpireDismissalRequestsUseCase(repository, realtime);

    await expect(service.runOnce({ now: NOW })).resolves.toMatchObject({
      expiredCount: 1,
    });
    expect(repository.expireCandidate).toHaveBeenCalledTimes(1);
  });

  it('treats a duplicate terminal candidate as a no-op', async () => {
    const repository = {
      listExpiredCandidates: jest.fn().mockResolvedValue([candidates[0]]),
      expireCandidate: jest.fn().mockResolvedValue(null),
    } as unknown as DismissalRequestsExpiryRepository;
    const realtime = {
      publishStatusChanged: jest.fn(),
    } as unknown as DismissalRealtimeEventsService;
    const service = new ExpireDismissalRequestsUseCase(repository, realtime);

    await expect(service.runOnce({ now: NOW })).resolves.toMatchObject({
      expiredCount: 0,
      skippedCount: 1,
    });
    expect(realtime.publishStatusChanged).not.toHaveBeenCalled();
  });
});

function queueMock(): BullmqService & Record<string, jest.Mock> {
  return {
    ensureJobFromPersistedTruth: jest.fn().mockResolvedValue('created'),
  } as unknown as BullmqService & Record<string, jest.Mock>;
}

function recoveryAnnouncementRow(overrides: Record<string, unknown>) {
  return {
    id: 'announcement-1',
    schoolId: 'school-1',
    publishedAt: NOW,
    school: { organizationId: 'org-1' },
    publishedBy: null,
    createdBy: null,
    ...overrides,
  };
}

function emailCandidate(status: SchoolEmailDeliveryRecipientStatus) {
  return {
    id: 'recipient-1',
    batchId: 'batch-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    actorUserId: '11111111-1111-4111-8111-111111111111',
    actorUserType: UserType.SCHOOL_USER,
    ineligibilityReason: null,
    status,
    createdAt: NOW,
  };
}

function importRecord(overrides?: Record<string, unknown>): any {
  return {
    id: 'import-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    uploadedFileId: 'file-1',
    type: 'students_basic',
    status: ImportJobStatus.PENDING,
    reportJson: null,
    createdById: '11111111-1111-4111-8111-111111111111',
    actorUserType: UserType.SCHOOL_USER,
    ineligibilityCode: null,
    createdAt: new Date(NOW.getTime() - 60_000),
    updatedAt: new Date(NOW.getTime() - 60_000),
    uploadedFile: {
      id: 'file-1',
      bucket: 'fixture-bucket',
      objectKey: 'fixture-object',
      originalName: 'fixture.csv',
      mimeType: 'text/csv',
      sizeBytes: 12n,
      visibility: 'PRIVATE',
    },
    ...(overrides ?? {}),
  };
}

function importRepositoryMock(
  record: any,
): ImportJobsRepository & Record<string, jest.Mock> {
  return {
    findImportJobById: jest.fn().mockResolvedValue(record),
    claimImportJobProcessing: jest.fn().mockResolvedValue({
      ...record,
      status: ImportJobStatus.PROCESSING,
    }),
    updateImportJob: jest
      .fn()
      .mockImplementation((input) => Promise.resolve({ ...record, ...input })),
  } as unknown as ImportJobsRepository & Record<string, jest.Mock>;
}

function dismissalCandidate(id: string) {
  return {
    id,
    schoolId: 'school-1',
    organizationId: 'org-1',
    requestedAt: new Date(NOW.getTime() - 4 * 60 * 60 * 1000),
    expiryThresholdMinutes: 180,
  };
}

function expired(requestId: string) {
  return {
    requestId,
    schoolId: 'school-1',
    previousStatus: DismissalRequestStatus.REQUESTED,
    expiryThresholdMinutes: 180,
    waitMinutes: 240,
  };
}
