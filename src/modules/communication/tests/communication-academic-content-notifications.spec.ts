import { randomUUID } from 'node:crypto';
import {
  AppDeviceTokenSurface,
  CommunicationNotificationDeliveryChannel as Channel,
  CommunicationNotificationDeliveryStatus as DeliveryStatus,
  CommunicationNotificationSourceModule as Module,
  CommunicationNotificationType as Type,
  UserType,
} from '@prisma/client';
import { CommunicationNotificationGenerationService } from '../application/communication-notification-generation.service';
import {
  CommunicationNotificationGenerationRepository,
  CommunicationGeneratedNotificationRecord,
} from '../infrastructure/communication-notification-generation.repository';
import { CommunicationNotificationPreferenceService } from '../application/communication-notification-preference.service';
import { CommunicationNotificationPreferenceRepository } from '../infrastructure/communication-notification-preference.repository';
import { CommunicationRealtimeEventsService } from '../application/communication-realtime-events.service';
import { CommunicationNotificationPushQueueService } from '../application/communication-notification-push-queue.service';
import { CommunicationNotificationQueueService } from '../application/communication-notification-queue.service';
import { CommunicationNotificationPushPayloadBuilder } from '../application/communication-notification-push-payload.builder';
import { CommunicationNotificationPushDeliveryService } from '../application/communication-notification-push-delivery.service';
import {
  CommunicationNotificationPushRepository,
  CommunicationPushDeliveryForProcessing,
} from '../infrastructure/communication-notification-push.repository';
import { AppDeviceTokenRepository } from '../../app-device-tokens/infrastructure/app-device-token.repository';
import { BullmqService } from '../../../infrastructure/queue/bullmq.service';
import {
  buildAcademicContentNotificationGenerationJobId,
  COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATIONS_GENERATE_JOB_NAME as JOB,
  CommunicationPreparedAcademicContentBatch,
  isAcademicContentNotificationGenerationJobData,
} from '../domain/communication-notification-generation-domain';
import { CommunicationNotificationGenerationWorker } from '../infrastructure/communication-notification-generation.worker';
import { AcademicContentPublicationNotificationService } from '../../academics/academic-content/application/academic-content-publication-notification.service';
import { getRequestContext } from '../../../common/context/request-context';

const batch = (): CommunicationPreparedAcademicContentBatch => {
  const contentId = randomUUID(),
    publicationId = randomUUID();
  return {
    eventType: 'academic_content_published',
    schoolId: randomUUID(),
    organizationId: randomUUID(),
    contentId,
    publicationId,
    actorUserId: null,
    actorUserType: null,
    title: 'New academic content',
    body: 'Frozen title',
    expiresAt: null,
    now: new Date(),
    recipients: [
      {
        recipientUserId: randomUUID(),
        metadata: {
          academicContentId: contentId,
          publicationId,
          revisionId: randomUUID(),
          contentType: 'general_resource',
          eventType: 'academic_content_published',
          publishedAt: new Date().toISOString(),
          studentIds: [randomUUID()],
          childContextCount: 1,
        },
      },
    ],
  };
};

describe('ACC publication Communication generation and preferences', () => {
  it.each(
    [
      { inApp: true, push: true },
      { inApp: false, push: true },
      { inApp: true, push: false },
    ].flatMap((settings) =>
      (['academic_content_published', 'academic_content_updated'] as const).map(
        (eventType) => ({ ...settings, eventType }),
      ),
    ),
  )(
    'preserves in-app=$inApp push=$push event=$eventType semantics and commit ordering',
    async ({ inApp, push, eventType }) => {
      const input = batch();
      input.eventType = eventType;
      input.recipients[0].metadata.eventType = eventType;
      const recipient = input.recipients[0].recipientUserId;
      const inAppDisabled = jest
        .fn()
        .mockResolvedValue(inApp ? [] : [recipient]);
      const pushDisabled = jest.fn().mockResolvedValue(push ? [] : [recipient]);
      const preferences = new CommunicationNotificationPreferenceService({
        listCurrentSchoolDisabledUserIdsForCategory: inAppDisabled,
        listCurrentSchoolPushDisabledUserIdsForCategory: pushDisabled,
      } as unknown as CommunicationNotificationPreferenceRepository);
      const phases: string[] = [];
      const create = jest.fn(
        (
          prepared: CommunicationPreparedAcademicContentBatch & {
            pushEnabledRecipientUserIds: string[];
          },
        ) => {
          phases.push('commit');
          return Promise.resolve({
            recipientCount: prepared.recipients.length,
            createdNotificationCount: prepared.recipients.length,
            existingNotificationCount: 0,
            createdDeliveryCount: prepared.recipients.length,
            existingDeliveryCount: 0,
            createdNotifications: prepared.recipients.length
              ? [
                  {
                    id: 'notification',
                  } as CommunicationGeneratedNotificationRecord,
                ]
              : [],
            pushDeliveries: prepared.pushEnabledRecipientUserIds.length
              ? [{ id: 'delivery', notificationId: 'notification' }]
              : [],
          });
        },
      );
      const realtime = jest.fn(() => {
        phases.push('realtime');
      });
      const enqueue = jest.fn(() => {
        phases.push('push');
        return Promise.resolve();
      });
      const service = new CommunicationNotificationGenerationService(
        {
          createMissingAcademicContentPublishedNotifications: create,
        } as unknown as CommunicationNotificationGenerationRepository,
        {
          publishNotificationCreated: realtime,
        } as unknown as CommunicationRealtimeEventsService,
        preferences,
        {
          enqueueNotificationPushDelivery: enqueue,
        } as unknown as CommunicationNotificationPushQueueService,
      );
      expect(
        (await service.generateForAcademicContentPublicationBatch(input))
          .recipientCount,
      ).toBe(inApp ? 1 : 0);
      expect(create.mock.calls[0][0].recipients).toHaveLength(inApp ? 1 : 0);
      expect(create.mock.calls[0][0].pushEnabledRecipientUserIds).toEqual(
        inApp && push ? [recipient] : [],
      );
      expect(realtime).toHaveBeenCalledTimes(inApp ? 1 : 0);
      expect(enqueue).toHaveBeenCalledTimes(inApp && push ? 1 : 0);
      expect(phases[0]).toBe('commit');
      expect(inAppDisabled).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'ACADEMIC_CONTENT' }),
      );
    },
  );
  it('rejects more than 500 or duplicate prepared users before database work', async () => {
    const service = new CommunicationNotificationGenerationService(
      {} as never,
      {} as never,
      {} as never,
    );
    const input = batch();
    input.recipients = Array.from({ length: 501 }, () => ({
      ...input.recipients[0],
      recipientUserId: randomUUID(),
    }));
    await expect(
      service.generateForAcademicContentPublicationBatch(input),
    ).rejects.toThrow('communication_prepared_notification_batch_invalid');
    input.recipients = [input.recipients[0], input.recipients[0]];
    await expect(
      service.generateForAcademicContentPublicationBatch(input),
    ).rejects.toThrow('communication_prepared_notification_batch_invalid');
  });
});

describe('ACC push navigation allowlist', () => {
  it.each(
    [0, 1, 2].flatMap((count) =>
      [Type.ACADEMIC_CONTENT_PUBLISHED, Type.ACADEMIC_CONTENT_UPDATED].map(
        (type) => ({ count, type }),
      ),
    ),
  )(
    'includes studentId only for one valid child (children=$count type=$type)',
    ({ count, type }) => {
      const input = batch();
      const studentIds = Array.from({ length: count }, () => randomUUID());
      const data = new CommunicationNotificationPushPayloadBuilder().build({
        id: randomUUID(),
        sourceModule: Module.ACADEMICS,
        sourceType: 'academic_content_publication',
        sourceId: input.publicationId,
        type,
        title: input.title,
        body: input.body,
        metadata: {
          ...input.recipients[0].metadata,
          studentIds,
          joinUrl: 'secret',
          accessCode: 'secret',
          fileUrl: 'secret',
          bucket: 'secret',
          objectKey: 'secret',
          phone: 'secret',
          email: 'secret',
          deviceToken: 'secret',
        },
      }).data;
      expect(data).toEqual({
        notificationId: expect.any(String) as unknown,
        type: type.toLowerCase(),
        sourceModule: 'academics',
        deepLinkType: 'academic_content',
        academicContentId: input.contentId,
        publicationId: input.publicationId,
        ...(count === 1 ? { studentId: studentIds[0] } : {}),
      });
      expect(JSON.stringify(data)).not.toContain('secret');
      expect(Object.values(data)).not.toContain('null');
    },
  );
  it('does not provide navigation for inconsistent or invalid UUID identities', () => {
    const input = batch();
    const data = new CommunicationNotificationPushPayloadBuilder().build({
      id: randomUUID(),
      sourceModule: Module.ACADEMICS,
      sourceType: 'academic_content_publication',
      sourceId: input.publicationId,
      type: Type.ACADEMIC_CONTENT_PUBLISHED,
      title: input.title,
      body: input.body,
      metadata: {
        ...input.recipients[0].metadata,
        publicationId: randomUUID(),
      },
    }).data;
    expect(data.deepLinkType).toBeUndefined();
  });
});

describe('ACC push surface isolation', () => {
  it.each(
    (
      [
        [UserType.STUDENT, AppDeviceTokenSurface.STUDENT],
        [UserType.PARENT, AppDeviceTokenSurface.PARENT],
        [UserType.TEACHER, null],
        [UserType.SCHOOL_USER, null],
      ] as const
    ).flatMap(([userType, surface]) =>
      [Type.ACADEMIC_CONTENT_PUBLISHED, Type.ACADEMIC_CONTENT_UPDATED].map(
        (type) => ({ userType, surface, type }),
      ),
    ),
  )(
    'routes $userType to $surface for $type with no all-surface fallback',
    async ({ userType, surface, type }) => {
      const delivery: CommunicationPushDeliveryForProcessing = {
        id: randomUUID(),
        schoolId: randomUUID(),
        notificationId: randomUUID(),
        channel: Channel.PUSH,
        status: DeliveryStatus.PENDING,
        provider: 'firebase_fcm',
        createdAt: new Date(),
        notification: {
          id: randomUUID(),
          schoolId: randomUUID(),
          recipientUserId: randomUUID(),
          sourceModule: Module.ACADEMICS,
          sourceType: 'academic_content_publication',
          sourceId: randomUUID(),
          type,
          title: 'New academic content',
          body: 'Title',
          metadata: {},
          recipientUser: { userType },
        },
      };
      const find = jest.fn().mockResolvedValue(delivery),
        lookup = jest.fn().mockResolvedValue([]),
        send = jest.fn(),
        update = jest.fn();
      const service = new CommunicationNotificationPushDeliveryService(
        {
          findCurrentSchoolPushDeliveryForProcessing: find,
          ensurePendingAttempts: jest.fn(),
          listAttemptsForDelivery: jest.fn().mockResolvedValue([]),
          updateDeliveryStatus: update,
        } as unknown as CommunicationNotificationPushRepository,
        {
          listActiveCurrentSchoolUserTokens: lookup,
        } as unknown as AppDeviceTokenRepository,
        {} as never,
        { sendBatch: send } as never,
        new CommunicationNotificationPushPayloadBuilder(),
      );
      await service.processDelivery({
        schoolId: delivery.schoolId,
        deliveryId: delivery.id,
      });
      if (surface)
        expect(lookup).toHaveBeenCalledWith({
          schoolId: delivery.schoolId,
          userId: delivery.notification.recipientUserId,
          appSurface: surface,
        });
      else {
        expect(lookup).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalledWith(
          expect.objectContaining({
            errorCode: 'push/academic-content-recipient-type-ineligible',
          }),
        );
      }
      expect(send).not.toHaveBeenCalled();
    },
  );
});

describe('ACC deterministic queue and existing worker dispatch', () => {
  it('ensures one logical colon-free job identity and validates exact server-owned payload', async () => {
    const {
      schoolId,
      organizationId,
      contentId,
      publicationId,
      actorUserId,
      actorUserType,
    } = batch();
    const data = {
      schoolId,
      organizationId,
      contentId,
      publicationId,
      actorUserId,
      actorUserType,
    };
    const ensure = jest.fn().mockResolvedValue('preserved');
    const service = new CommunicationNotificationQueueService({
      ensureJobFromPersistedTruth: ensure,
    } as unknown as BullmqService);
    await service.ensureAcademicContentPublishedNotifications(data);
    await service.ensureAcademicContentPublishedNotifications(data);
    expect(ensure.mock.calls[0]).toEqual(ensure.mock.calls[1]);
    expect(ensure.mock.calls[0]).toEqual([
      'communication-notifications',
      JOB,
      data,
      {
        jobId: buildAcademicContentNotificationGenerationJobId(data),
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    ]);
    expect(buildAcademicContentNotificationGenerationJobId(data)).not.toContain(
      ':',
    );
    expect(
      isAcademicContentNotificationGenerationJobData({ ...data, metadata: {} }),
    ).toBe(false);
    expect(
      isAcademicContentNotificationGenerationJobData({
        ...data,
        actorUserId: randomUUID(),
      }),
    ).toBe(false);
  });
  it('reuses one worker, reconstructs scoped context and rejects unknown/malformed jobs', async () => {
    let process:
      | ((job: { name: string; id: string; data: unknown }) => Promise<void>)
      | undefined;
    const createWorker = jest.fn((_queue: string, callback: typeof process) => {
      process = callback;
    });
    const observed = jest.fn<Promise<ReturnType<typeof getRequestContext>>, []>(
      () => Promise.resolve(getRequestContext()),
    );
    const reconcile = jest.fn();
    new CommunicationNotificationGenerationWorker(
      { createWorker } as unknown as BullmqService,
      {} as never,
      { reconcile } as never,
      {
        generate: observed,
      } as unknown as AcademicContentPublicationNotificationService,
    ).onModuleInit();
    const {
      schoolId,
      organizationId,
      contentId,
      publicationId,
      actorUserId,
      actorUserType,
    } = batch();
    const data = {
      schoolId,
      organizationId,
      contentId,
      publicationId,
      actorUserId,
      actorUserType,
    };
    if (!process) throw new Error('worker_missing');
    await process({ name: JOB, id: 'job', data });
    const result = observed.mock.results[0];
    if (result.type !== 'return') throw new Error('worker_dispatch_missing');
    const observedContext = await result.value;
    expect(observedContext?.activeMembership?.schoolId).toBe(schoolId);
    expect(observedContext?.actor).toBeUndefined();
    expect(createWorker).toHaveBeenCalledTimes(1);
    await expect(
      process({ name: JOB, id: 'invalid', data: { ...data, take: 10000 } }),
    ).rejects.toThrow('academic_content_notification_job_invalid');
    await expect(
      process({ name: 'unknown', id: 'invalid', data }),
    ).rejects.toThrow('communication_notification_job_unknown');
  });
});
