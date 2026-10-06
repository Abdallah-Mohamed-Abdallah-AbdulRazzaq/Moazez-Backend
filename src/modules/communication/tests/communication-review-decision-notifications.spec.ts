import { randomUUID } from 'node:crypto';
import {
  AppDeviceTokenSurface,
  CommunicationNotificationType as Type,
  UserType,
} from '@prisma/client';
import { getRequestContext } from '../../../common/context/request-context';
import { CommunicationNotificationQueueService } from '../application/communication-notification-queue.service';
import { CommunicationNotificationPushPayloadBuilder } from '../application/communication-notification-push-payload.builder';
import { CommunicationNotificationPushDeliveryService } from '../application/communication-notification-push-delivery.service';
import { CommunicationPushDeliveryForProcessing } from '../infrastructure/communication-notification-push.repository';
import { CommunicationNotificationGenerationWorker } from '../infrastructure/communication-notification-generation.worker';
import { buildDeepLink } from '../presenters/communication-app-notification.presenter';
import {
  COMMUNICATION_ACADEMIC_CONTENT_REVIEW_DECISION_GENERATE_JOB_NAME as JOB,
  buildAcademicContentReviewDecisionJobId,
  isAcademicContentReviewDecisionJobData,
  CommunicationAcademicContentReviewDecisionJobData,
} from '../domain/communication-notification-generation-domain';

const identity = (): CommunicationAcademicContentReviewDecisionJobData => ({
  schoolId: randomUUID(),
  organizationId: randomUUID(),
  approvalId: randomUUID(),
  actorUserId: null,
  actorUserType: null,
});
const review = (type: Type = Type.ACADEMIC_CONTENT_APPROVED) => {
  const approvalId = randomUUID();
  return {
    id: randomUUID(),
    type,
    sourceModule: 'ACADEMICS',
    sourceType: 'academic_content_approval',
    sourceId: approvalId,
    title: 'Academic content approved',
    body: 'Frozen revision',
    metadata: {
      academicContentId: randomUUID(),
      revisionId: randomUUID(),
      approvalId,
      roundNumber: 2,
      decision: 'approved',
    },
  };
};

describe('ACC-9E review decision Communication contracts', () => {
  it('validates exact identity keys and actor pairs, rejecting queue presentation authority', () => {
    const data = identity();
    expect(isAcademicContentReviewDecisionJobData(data)).toBe(true);
    expect(
      isAcademicContentReviewDecisionJobData({
        ...data,
        actorUserId: randomUUID(),
        actorUserType: UserType.SCHOOL_USER,
      }),
    ).toBe(true);
    for (const input of [
      null,
      [],
      { ...data, approvalId: 'bad' },
      { ...data, actorUserId: randomUUID() },
      { ...data, actorUserType: UserType.TEACHER },
      { ...data, actorUserId: randomUUID(), actorUserType: 'invented' },
      ...[
        'title',
        'body',
        'recipientUserId',
        'decision',
        'decisionNote',
        'metadata',
      ].map((key) => ({ ...data, [key]: 'untrusted' })),
    ])
      expect(isAcademicContentReviewDecisionJobData(input)).toBe(false);
  });
  it('ensures one deterministic job through the existing persisted-truth queue operation', async () => {
    const ensureJobFromPersistedTruth = jest.fn().mockResolvedValue('replaced');
    const queue = new CommunicationNotificationQueueService({
      ensureJobFromPersistedTruth,
    } as never);
    const data = identity();
    await expect(queue.ensureAcademicContentReviewDecision(data)).resolves.toBe(
      'replaced',
    );
    expect(ensureJobFromPersistedTruth).toHaveBeenCalledWith(
      'communication-notifications',
      JOB,
      data,
      {
        jobId: `communication-academic-content-review-decision-${data.schoolId}-${data.approvalId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
    expect(buildAcademicContentReviewDecisionJobId(data)).not.toContain(':');
    expect(() =>
      queue.ensureAcademicContentReviewDecision({
        ...data,
        body: 'bad',
      } as never),
    ).toThrow();
    expect(ensureJobFromPersistedTruth).toHaveBeenCalledTimes(1);
  });
  it('dispatches the new job on the existing worker under its exact School context', async () => {
    let processor: (job: {
      name: string;
      id: string;
      data: unknown;
    }) => Promise<void> = () =>
      Promise.reject(new Error('worker_not_registered'));
    const createWorker = jest.fn(
      (_queue: string, handler: typeof processor) => {
        processor = handler;
      },
    );
    const generate = jest.fn(() => Promise.resolve(getRequestContext()));
    new CommunicationNotificationGenerationWorker(
      { createWorker } as never,
      {} as never,
      {} as never,
      {} as never,
      { generate } as never,
    ).onModuleInit();
    const data = identity();
    await processor({ name: JOB, id: 'review', data });
    const context = await (generate.mock.results[0].value as Promise<
      ReturnType<typeof getRequestContext>
    >);
    expect(context?.activeMembership).toMatchObject({
      schoolId: data.schoolId,
      organizationId: data.organizationId,
      permissions: [],
    });
    expect(createWorker).toHaveBeenCalledTimes(1);
    await expect(
      processor({
        name: JOB,
        id: 'bad',
        data: { ...data, recipientUserId: randomUUID() },
      }),
    ).rejects.toThrow('academic_content_review_decision_job_invalid');
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it.each([
    Type.ACADEMIC_CONTENT_APPROVED,
    Type.ACADEMIC_CONTENT_CHANGES_REQUESTED,
  ])('presents and serializes safe %s links', (type) => {
    const row = review(type);
    expect(buildDeepLink(row)).toEqual({
      type: 'teacher_academic_content',
      academicContentId: row.metadata.academicContentId,
      revisionId: row.metadata.revisionId,
      approvalId: row.sourceId,
    });
    expect(
      new CommunicationNotificationPushPayloadBuilder().build(row).data,
    ).toEqual({
      notificationId: row.id,
      type: type.toLowerCase(),
      sourceModule: 'academics',
      deepLinkType: 'teacher_academic_content',
      academicContentId: row.metadata.academicContentId,
      revisionId: row.metadata.revisionId,
      approvalId: row.sourceId,
    });
  });
  it('fails closed for malformed, mismatched or non-review navigation', () => {
    const row = review();
    for (const invalid of [
      { ...row, sourceModule: 'COMMUNICATION' },
      { ...row, sourceType: 'academic_content_publication' },
      { ...row, type: Type.ACADEMIC_CONTENT_PUBLISHED },
      { ...row, sourceId: 'bad' },
      ...['approvalId', 'academicContentId', 'revisionId'].map((key) => ({
        ...row,
        metadata: { ...row.metadata, [key]: 'bad' },
      })),
      { ...row, metadata: { ...row.metadata, approvalId: randomUUID() } },
    ])
      expect(buildDeepLink(invalid)).toBeNull();
    const publication = {
      ...row,
      type: Type.ACADEMIC_CONTENT_PUBLISHED,
      sourceType: 'academic_content_publication',
      metadata: {
        academicContentId: row.metadata.academicContentId,
        publicationId: row.sourceId,
        studentIds: [],
      },
    };
    expect(buildDeepLink(publication)).toEqual({
      type: 'academic_content',
      academicContentId: row.metadata.academicContentId,
      publicationId: row.sourceId,
      studentId: null,
    });
    expect(
      new CommunicationNotificationPushPayloadBuilder().build(publication).data,
    ).toEqual({
      notificationId: row.id,
      type: 'academic_content_published',
      sourceModule: 'academics',
      deepLinkType: 'academic_content',
      academicContentId: row.metadata.academicContentId,
      publicationId: row.sourceId,
    });
  });
  it.each([
    [
      Type.ACADEMIC_CONTENT_APPROVED,
      UserType.TEACHER,
      'ACADEMICS',
      'academic_content_approval',
      AppDeviceTokenSurface.TEACHER,
    ],
    [
      Type.ACADEMIC_CONTENT_CHANGES_REQUESTED,
      UserType.TEACHER,
      'ACADEMICS',
      'academic_content_approval',
      AppDeviceTokenSurface.TEACHER,
    ],
    [
      Type.ACADEMIC_CONTENT_APPROVED,
      UserType.PARENT,
      'ACADEMICS',
      'academic_content_approval',
      null,
    ],
    [
      Type.ACADEMIC_CONTENT_APPROVED,
      UserType.STUDENT,
      'ACADEMICS',
      'academic_content_approval',
      null,
    ],
    [
      Type.ACADEMIC_CONTENT_APPROVED,
      UserType.TEACHER,
      'COMMUNICATION',
      'academic_content_approval',
      null,
    ],
    [
      Type.ACADEMIC_CONTENT_APPROVED,
      UserType.TEACHER,
      'ACADEMICS',
      'academic_content_publication',
      null,
    ],
    [
      Type.ACADEMIC_CONTENT_PUBLISHED,
      UserType.TEACHER,
      'ACADEMICS',
      'academic_content_publication',
      null,
    ],
    [
      Type.ACADEMIC_CONTENT_PUBLISHED,
      UserType.PARENT,
      'ACADEMICS',
      'academic_content_publication',
      AppDeviceTokenSurface.PARENT,
    ],
    [
      Type.ACADEMIC_CONTENT_PUBLISHED,
      UserType.STUDENT,
      'ACADEMICS',
      'academic_content_publication',
      AppDeviceTokenSurface.STUDENT,
    ],
  ])(
    'routes %s / %s / %s / %s to only %s',
    async (type, userType, sourceModule, sourceType, surface) => {
      const row = review(type);
      const listActiveCurrentSchoolUserTokens = jest.fn().mockResolvedValue([]);
      const repository = {
        findCurrentSchoolPushDeliveryForProcessing: jest
          .fn()
          .mockResolvedValue({
            id: row.id,
            schoolId: row.id,
            createdAt: new Date(),
            status: 'PENDING',
            notification: {
              ...row,
              sourceModule,
              sourceType,
              recipientUserId: row.id,
              recipientUser: { userType },
            },
          } as unknown as CommunicationPushDeliveryForProcessing),
        findCurrentDeliveryEligibility: jest.fn().mockResolvedValue({
          status: 'PENDING',
          errorCode: null,
          ineligibilityCode: null,
        }),
        updateDeliveryStatus: jest.fn(),
        ensurePendingAttempts: jest.fn(),
        listAttemptsForDelivery: jest.fn().mockResolvedValue([]),
      };
      const service = new CommunicationNotificationPushDeliveryService(
        repository as never,
        { listActiveCurrentSchoolUserTokens } as never,
        {} as never,
        {} as never,
        new CommunicationNotificationPushPayloadBuilder(),
      );
      await service.processDelivery({ schoolId: row.id, deliveryId: row.id });
      if (surface)
        expect(listActiveCurrentSchoolUserTokens).toHaveBeenCalledWith({
          schoolId: row.id,
          userId: row.id,
          appSurface: surface,
        });
      else expect(listActiveCurrentSchoolUserTokens).not.toHaveBeenCalled();
    },
  );
});
