import {
  CommunicationAnnouncementAudienceType,
  CommunicationAnnouncementPriority,
  CommunicationAnnouncementStatus,
  CommunicationConversationStatus,
  CommunicationMessageKind,
  CommunicationMessageStatus,
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationDeliveryStatus,
  CommunicationNotificationPriority,
  CommunicationNotificationSourceModule,
  CommunicationNotificationStatus,
  CommunicationNotificationType,
  CommunicationParticipantRole,
  CommunicationParticipantStatus,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  CommunicationAnnouncementForNotificationGeneration,
  CommunicationGeneratedNotificationRecord,
  CommunicationMessageForNotificationGeneration,
  CommunicationNotificationGenerationRepository,
} from '../infrastructure/communication-notification-generation.repository';

describe('CommunicationNotificationGenerationRepository', () => {
  it('resolves school audiences from active current-school memberships', async () => {
    const scoped = {
      membership: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { userId: 'user-1' },
            { userId: 'user-2' },
            { userId: 'user-1' },
          ]),
      },
    };
    const repository = new CommunicationNotificationGenerationRepository({
      scoped,
    } as unknown as PrismaService);

    const result =
      await repository.resolveCurrentSchoolAnnouncementRecipientUserIds(
        announcementRecord({
          audienceType: CommunicationAnnouncementAudienceType.SCHOOL,
        }),
      );

    expect(result).toEqual(['user-1', 'user-2']);
    expect(scoped.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
        }),
      }),
    );
  });

  it('resolves custom audience safe targets and filters them through active current-school memberships', async () => {
    const scoped = {
      studentGuardian: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ guardian: { userId: 'guardian-user-1' } }]),
      },
      guardian: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'guardian-user-1' }]),
      },
      membership: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'guardian-user-1' }]),
      },
    };
    const repository = new CommunicationNotificationGenerationRepository({
      scoped,
    } as unknown as PrismaService);

    const result =
      await repository.resolveCurrentSchoolAnnouncementRecipientUserIds(
        announcementRecord({
          audienceType: CommunicationAnnouncementAudienceType.CUSTOM,
          audiences: [
            audienceRecord({ studentId: 'student-1' }),
            audienceRecord({ guardianId: 'guardian-1' }),
            audienceRecord({ userId: 'outside-or-inactive-user' }),
          ],
        }),
      );

    expect(result).toEqual(['guardian-user-1']);
    expect(scoped.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: {
            in: ['guardian-user-1', 'outside-or-inactive-user'],
          },
        }),
      }),
    );
  });

  it('resolves message notification recipients from active readable non-sender participants', () => {
    const repository = new CommunicationNotificationGenerationRepository({
      scoped: {},
    } as unknown as PrismaService);

    const result = repository.resolveCurrentSchoolMessageRecipientUserIds(
      messageRecord({
        conversation: {
          id: 'conversation-1',
          status: CommunicationConversationStatus.ACTIVE,
          deletedAt: null,
          participants: [
            participantRecord({ id: 'sender', userId: 'sender-1' }),
            participantRecord({ id: 'active', userId: 'recipient-1' }),
            participantRecord({
              id: 'read-only',
              userId: 'recipient-2',
              role: CommunicationParticipantRole.READ_ONLY,
            }),
            participantRecord({
              id: 'future-muted',
              userId: 'muted-future',
              mutedUntil: new Date('2026-05-04T09:00:00.000Z'),
            }),
            participantRecord({
              id: 'muted-status',
              userId: 'muted-status',
              status: CommunicationParticipantStatus.MUTED,
            }),
            participantRecord({
              id: 'blocked',
              userId: 'blocked-user',
              status: CommunicationParticipantStatus.BLOCKED,
            }),
            participantRecord({
              id: 'system',
              userId: 'system-user',
              role: CommunicationParticipantRole.SYSTEM,
            }),
            participantRecord({
              id: 'inactive-user',
              userId: 'inactive-user',
              user: {
                id: 'inactive-user',
                status: UserStatus.DISABLED,
                deletedAt: null,
              },
            }),
          ],
        },
      }),
      new Date('2026-05-03T09:00:00.000Z'),
    );

    expect(result).toEqual(['recipient-1', 'recipient-2']);
  });

  it('creates only missing notification and IN_APP delivery rows on retry-safe generation', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      communicationNotification: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'existing-notification-1', recipientUserId: 'user-1' },
          ]),
        create: jest.fn().mockResolvedValue(generatedNotificationRecord()),
      },
      communicationNotificationDelivery: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ notificationId: 'existing-notification-1' }])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              id: 'push-delivery-existing',
              notificationId: 'existing-notification-1',
            },
            {
              id: 'push-delivery-new',
              notificationId: 'new-notification-1',
            },
          ]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const scoped = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const repository = new CommunicationNotificationGenerationRepository({
      scoped,
    } as unknown as PrismaService);

    const result =
      await repository.createMissingAnnouncementPublishedNotifications({
        schoolId: 'school-1',
        announcementId: 'announcement-1',
        recipientUserIds: ['user-1', 'user-2', 'user-2'],
        pushEnabledRecipientUserIds: ['user-1', 'user-2'],
        actorUserId: 'actor-1',
        title: 'Announcement',
        body: 'Preview',
        priority: CommunicationNotificationPriority.NORMAL,
        expiresAt: null,
        metadata: { announcementId: 'announcement-1' },
        now: new Date('2026-05-03T09:00:00.000Z'),
      });

    expect(result).toEqual({
      recipientCount: 2,
      createdNotificationCount: 1,
      existingNotificationCount: 1,
      createdDeliveryCount: 1,
      existingDeliveryCount: 1,
      createdNotifications: [generatedNotificationRecord()],
      pushDeliveries: [
        {
          id: 'push-delivery-existing',
          notificationId: 'existing-notification-1',
        },
        {
          id: 'push-delivery-new',
          notificationId: 'new-notification-1',
        },
      ],
    });
    expect(tx.communicationNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientUserId: 'user-2',
          sourceModule: CommunicationNotificationSourceModule.ANNOUNCEMENTS,
          sourceType: 'communication_announcement',
          sourceId: 'announcement-1',
          type: CommunicationNotificationType.ANNOUNCEMENT_PUBLISHED,
          status: CommunicationNotificationStatus.UNREAD,
        }),
        select: expect.objectContaining({
          id: true,
          recipientUserId: true,
          sourceModule: true,
          sourceId: true,
          type: true,
          status: true,
          createdAt: true,
        }),
      }),
    );
    expect(
      tx.communicationNotificationDelivery.createMany,
    ).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          notificationId: 'new-notification-1',
          channel: CommunicationNotificationDeliveryChannel.IN_APP,
          status: CommunicationNotificationDeliveryStatus.DELIVERED,
          provider: 'in_app',
        }),
      ],
    });
    expect(
      tx.communicationNotificationDelivery.createMany,
    ).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          notificationId: 'existing-notification-1',
          channel: CommunicationNotificationDeliveryChannel.PUSH,
          status: CommunicationNotificationDeliveryStatus.PENDING,
          provider: 'firebase_fcm',
        }),
        expect.objectContaining({
          notificationId: 'new-notification-1',
          channel: CommunicationNotificationDeliveryChannel.PUSH,
          status: CommunicationNotificationDeliveryStatus.PENDING,
          provider: 'firebase_fcm',
        }),
      ],
    });
  });

  it('creates only missing message notification and IN_APP delivery rows on retry-safe generation', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      communicationNotification: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'existing-notification-1', recipientUserId: 'recipient-1' },
          ]),
        create: jest.fn().mockResolvedValue(
          generatedNotificationRecord({
            id: 'message-notification-1',
            recipientUserId: 'recipient-2',
            sourceModule: CommunicationNotificationSourceModule.COMMUNICATION,
            sourceType: 'communication_message',
            sourceId: 'message-1',
            type: CommunicationNotificationType.MESSAGE_RECEIVED,
          }),
        ),
      },
      communicationNotificationDelivery: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ notificationId: 'existing-notification-1' }])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              id: 'push-delivery-existing',
              notificationId: 'existing-notification-1',
            },
            {
              id: 'push-delivery-new',
              notificationId: 'message-notification-1',
            },
          ]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const scoped = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const repository = new CommunicationNotificationGenerationRepository({
      scoped,
    } as unknown as PrismaService);

    const result = await repository.createMissingMessageNotifications({
      schoolId: 'school-1',
      messageId: 'message-1',
      conversationId: 'conversation-1',
      recipientUserIds: ['recipient-1', 'recipient-2', 'recipient-2'],
      pushEnabledRecipientUserIds: ['recipient-1', 'recipient-2'],
      actorUserId: 'sender-1',
      title: 'New message',
      body: 'Preview',
      type: CommunicationNotificationType.MESSAGE_RECEIVED,
      priority: CommunicationNotificationPriority.NORMAL,
      metadata: {
        conversationId: 'conversation-1',
        messageId: 'message-1',
      },
      now: new Date('2026-05-03T09:00:00.000Z'),
    });

    expect(result).toMatchObject({
      recipientCount: 2,
      createdNotificationCount: 1,
      existingNotificationCount: 1,
      createdDeliveryCount: 1,
      existingDeliveryCount: 1,
      pushDeliveries: [
        {
          id: 'push-delivery-existing',
          notificationId: 'existing-notification-1',
        },
        {
          id: 'push-delivery-new',
          notificationId: 'message-notification-1',
        },
      ],
    });
    expect(tx.communicationNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          recipientUserId: { in: ['recipient-1', 'recipient-2'] },
          sourceModule: CommunicationNotificationSourceModule.COMMUNICATION,
          sourceType: 'communication_message',
          sourceId: 'message-1',
          type: CommunicationNotificationType.MESSAGE_RECEIVED,
        }),
      }),
    );
    expect(tx.communicationNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientUserId: 'recipient-2',
          actorUserId: 'sender-1',
          sourceModule: CommunicationNotificationSourceModule.COMMUNICATION,
          sourceType: 'communication_message',
          sourceId: 'message-1',
          type: CommunicationNotificationType.MESSAGE_RECEIVED,
          status: CommunicationNotificationStatus.UNREAD,
          metadata: {
            conversationId: 'conversation-1',
            messageId: 'message-1',
          },
        }),
        select: expect.objectContaining({
          metadata: true,
          recipientUserId: true,
          sourceModule: true,
          sourceId: true,
          type: true,
          status: true,
        }),
      }),
    );
    expect(
      tx.communicationNotificationDelivery.createMany,
    ).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          notificationId: 'message-notification-1',
          channel: CommunicationNotificationDeliveryChannel.IN_APP,
          status: CommunicationNotificationDeliveryStatus.DELIVERED,
          provider: 'in_app',
        }),
      ],
    });
    expect(
      tx.communicationNotificationDelivery.createMany,
    ).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          notificationId: 'existing-notification-1',
          channel: CommunicationNotificationDeliveryChannel.PUSH,
          status: CommunicationNotificationDeliveryStatus.PENDING,
          provider: 'firebase_fcm',
        }),
        expect.objectContaining({
          notificationId: 'message-notification-1',
          channel: CommunicationNotificationDeliveryChannel.PUSH,
          status: CommunicationNotificationDeliveryStatus.PENDING,
          provider: 'firebase_fcm',
        }),
      ],
    });
  });

  it('creates skipped push delivery rows for push-disabled recipients without enqueue candidates', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      communicationNotification: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue(
          generatedNotificationRecord({
            id: 'message-notification-1',
            recipientUserId: 'recipient-1',
            sourceModule: CommunicationNotificationSourceModule.COMMUNICATION,
            sourceType: 'communication_message',
            sourceId: 'message-1',
            type: CommunicationNotificationType.MESSAGE_RECEIVED,
          }),
        ),
      },
      communicationNotificationDelivery: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const scoped = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const repository = new CommunicationNotificationGenerationRepository({
      scoped,
    } as unknown as PrismaService);

    const result = await repository.createMissingMessageNotifications({
      schoolId: 'school-1',
      messageId: 'message-1',
      conversationId: 'conversation-1',
      recipientUserIds: ['recipient-1'],
      pushEnabledRecipientUserIds: [],
      actorUserId: 'sender-1',
      title: 'New message',
      body: 'Preview',
      type: CommunicationNotificationType.MESSAGE_RECEIVED,
      priority: CommunicationNotificationPriority.NORMAL,
      metadata: {
        conversationId: 'conversation-1',
        messageId: 'message-1',
      },
      now: new Date('2026-05-03T09:00:00.000Z'),
    });

    expect(result.pushDeliveries).toEqual([]);
    expect(
      tx.communicationNotificationDelivery.createMany,
    ).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          notificationId: 'message-notification-1',
          channel: CommunicationNotificationDeliveryChannel.PUSH,
          status: CommunicationNotificationDeliveryStatus.SKIPPED,
          provider: 'firebase_fcm',
          errorCode: 'push/preference-disabled',
          errorMessage: 'Push notification preference disabled',
        }),
      ],
    });
    expect(tx.communicationNotificationDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: CommunicationNotificationDeliveryStatus.SKIPPED,
          errorCode: 'push/preference-disabled',
        }),
      }),
    );
  });
});

function announcementRecord(
  overrides?: Partial<CommunicationAnnouncementForNotificationGeneration>,
): CommunicationAnnouncementForNotificationGeneration {
  return {
    id: 'announcement-1',
    schoolId: 'school-1',
    title: 'Announcement',
    body: 'Body',
    status: CommunicationAnnouncementStatus.PUBLISHED,
    priority: CommunicationAnnouncementPriority.NORMAL,
    audienceType: CommunicationAnnouncementAudienceType.SCHOOL,
    publishedAt: new Date('2026-05-03T09:00:00.000Z'),
    expiresAt: null,
    createdById: 'creator-1',
    publishedById: 'actor-1',
    audiences: [],
    ...(overrides ?? {}),
  };
}

function generatedNotificationRecord(
  overrides?: Partial<CommunicationGeneratedNotificationRecord>,
): CommunicationGeneratedNotificationRecord {
  return {
    id: 'new-notification-1',
    schoolId: 'school-1',
    recipientUserId: 'user-2',
    actorUserId: 'actor-1',
    sourceModule: CommunicationNotificationSourceModule.ANNOUNCEMENTS,
    sourceType: 'communication_announcement',
    sourceId: 'announcement-1',
    type: CommunicationNotificationType.ANNOUNCEMENT_PUBLISHED,
    title: 'Announcement',
    body: 'Preview',
    priority: CommunicationNotificationPriority.NORMAL,
    status: CommunicationNotificationStatus.UNREAD,
    readAt: null,
    archivedAt: null,
    expiresAt: null,
    metadata: null,
    createdAt: new Date('2026-05-03T09:00:00.000Z'),
    updatedAt: new Date('2026-05-03T09:00:00.000Z'),
    ...(overrides ?? {}),
  };
}

function messageRecord(
  overrides?: Partial<CommunicationMessageForNotificationGeneration>,
): CommunicationMessageForNotificationGeneration {
  return {
    id: 'message-1',
    schoolId: 'school-1',
    conversationId: 'conversation-1',
    senderUserId: 'sender-1',
    kind: CommunicationMessageKind.TEXT,
    status: CommunicationMessageStatus.SENT,
    body: 'Hello',
    hiddenAt: null,
    deletedAt: null,
    sentAt: new Date('2026-05-03T09:00:00.000Z'),
    createdAt: new Date('2026-05-03T09:00:00.000Z'),
    conversation: {
      id: 'conversation-1',
      status: CommunicationConversationStatus.ACTIVE,
      deletedAt: null,
      participants: [
        participantRecord({ id: 'sender', userId: 'sender-1' }),
        participantRecord({ id: 'recipient', userId: 'recipient-1' }),
      ],
    },
    ...(overrides ?? {}),
  };
}

function participantRecord(
  overrides?: Partial<
    CommunicationMessageForNotificationGeneration['conversation']['participants'][number]
  >,
): CommunicationMessageForNotificationGeneration['conversation']['participants'][number] {
  const userId = overrides?.userId ?? 'recipient-1';
  return {
    id: 'participant-1',
    userId,
    role: CommunicationParticipantRole.MEMBER,
    status: CommunicationParticipantStatus.ACTIVE,
    mutedUntil: null,
    user: {
      id: userId,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
    ...(overrides ?? {}),
  };
}

function audienceRecord(
  overrides?: Partial<
    CommunicationAnnouncementForNotificationGeneration['audiences'][number]
  >,
): CommunicationAnnouncementForNotificationGeneration['audiences'][number] {
  return {
    id: 'audience-1',
    audienceType: CommunicationAnnouncementAudienceType.CUSTOM,
    stageId: null,
    gradeId: null,
    sectionId: null,
    classroomId: null,
    studentId: null,
    guardianId: null,
    userId: null,
    ...(overrides ?? {}),
  };
}
