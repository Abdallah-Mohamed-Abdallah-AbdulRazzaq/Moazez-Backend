import {
  CommunicationAnnouncementAudienceType,
  CommunicationAnnouncementPriority,
  CommunicationAnnouncementStatus,
  CommunicationConversationStatus,
  CommunicationMessageKind,
  CommunicationMessageStatus,
  CommunicationNotificationPriority,
  CommunicationNotificationSourceModule,
  CommunicationNotificationStatus,
  CommunicationNotificationType,
  CommunicationParticipantRole,
  CommunicationParticipantStatus,
  UserType,
  UserStatus,
} from '@prisma/client';
import { CommunicationRealtimeEventsService } from '../application/communication-realtime-events.service';
import { CommunicationNotificationGenerationService } from '../application/communication-notification-generation.service';
import { CommunicationNotificationPreferenceService } from '../application/communication-notification-preference.service';
import {
  CommunicationAnnouncementForNotificationGeneration,
  CommunicationGeneratedNotificationRecord,
  CommunicationMessageForNotificationGeneration,
  CommunicationNotificationGenerationRepository,
} from '../infrastructure/communication-notification-generation.repository';

const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';
const ANNOUNCEMENT_ID = 'announcement-1';
const MESSAGE_ID = 'message-1';
const CONVERSATION_ID = 'conversation-1';
const ACTOR_ID = 'actor-1';

describe('CommunicationNotificationGenerationService', () => {
  it('generates announcement notifications for resolved recipients with safe content', async () => {
    const realtime = realtimeMock();
    const repository = repositoryMock({
      resolveCurrentSchoolAnnouncementRecipientUserIds: jest
        .fn()
        .mockResolvedValue(['user-1', 'user-2', 'user-1']),
      createMissingAnnouncementPublishedNotifications: jest
        .fn()
        .mockResolvedValue({
          recipientCount: 2,
          createdNotificationCount: 2,
          existingNotificationCount: 0,
          createdDeliveryCount: 2,
          existingDeliveryCount: 0,
          createdNotifications: [
            generatedNotificationRecord({ recipientUserId: 'user-1' }),
            generatedNotificationRecord({
              id: 'notification-2',
              recipientUserId: 'user-2',
            }),
          ],
        }),
    });

    const result = await createGenerationService(
      repository,
      realtime,
    ).generateForPublishedAnnouncement(jobData());

    expect(result).toMatchObject({
      announcementId: ANNOUNCEMENT_ID,
      recipientCount: 2,
      createdNotificationCount: 2,
      createdDeliveryCount: 2,
      skippedReason: null,
    });
    expect(
      repository.createMissingAnnouncementPublishedNotifications,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        announcementId: ANNOUNCEMENT_ID,
        recipientUserIds: ['user-1', 'user-2'],
        actorUserId: ACTOR_ID,
        title: 'Published announcement',
        body: 'Body with spacing',
        priority: CommunicationNotificationPriority.HIGH,
        metadata: expect.not.objectContaining({ schoolId: expect.anything() }),
        now: expect.any(Date),
      }),
    );
    expect(realtime.publishNotificationCreated).toHaveBeenCalledTimes(2);
    expect(realtime.publishNotificationCreated).toHaveBeenCalledWith(
      SCHOOL_ID,
      expect.objectContaining({
        id: 'notification-1',
        recipientUserId: 'user-1',
      }),
    );
    expect(realtime.publishNotificationCreated).toHaveBeenCalledWith(
      SCHOOL_ID,
      expect.objectContaining({
        id: 'notification-2',
        recipientUserId: 'user-2',
      }),
    );
  });

  it('skips missing or unpublished announcements', async () => {
    const realtime = realtimeMock();
    const repository = repositoryMock({
      findPublishedCurrentSchoolAnnouncementForNotificationGeneration: jest
        .fn()
        .mockResolvedValue(null),
    });

    const result = await createGenerationService(
      repository,
      realtime,
    ).generateForPublishedAnnouncement(jobData());

    expect(result).toMatchObject({
      announcementId: ANNOUNCEMENT_ID,
      skippedReason: 'announcement_not_published_or_not_found',
    });
    expect(
      repository.resolveCurrentSchoolAnnouncementRecipientUserIds,
    ).not.toHaveBeenCalled();
    expect(
      repository.createMissingAnnouncementPublishedNotifications,
    ).not.toHaveBeenCalled();
    expect(realtime.publishNotificationCreated).not.toHaveBeenCalled();
  });

  it('skips published announcements with no safely resolved recipients', async () => {
    const realtime = realtimeMock();
    const repository = repositoryMock({
      resolveCurrentSchoolAnnouncementRecipientUserIds: jest
        .fn()
        .mockResolvedValue([]),
    });

    const result = await createGenerationService(
      repository,
      realtime,
    ).generateForPublishedAnnouncement(jobData());

    expect(result).toMatchObject({
      announcementId: ANNOUNCEMENT_ID,
      recipientCount: 0,
      skippedReason: 'no_resolved_recipients',
    });
    expect(
      repository.createMissingAnnouncementPublishedNotifications,
    ).not.toHaveBeenCalled();
    expect(realtime.publishNotificationCreated).not.toHaveBeenCalled();
  });

  it('returns existing counts on retry without treating them as new notifications', async () => {
    const realtime = realtimeMock();
    const repository = repositoryMock({
      createMissingAnnouncementPublishedNotifications: jest
        .fn()
        .mockResolvedValue({
          recipientCount: 2,
          createdNotificationCount: 0,
          existingNotificationCount: 2,
          createdDeliveryCount: 0,
          existingDeliveryCount: 2,
          createdNotifications: [],
        }),
    });

    const result = await createGenerationService(
      repository,
      realtime,
    ).generateForPublishedAnnouncement(jobData());

    expect(result).toMatchObject({
      createdNotificationCount: 0,
      existingNotificationCount: 2,
      createdDeliveryCount: 0,
      existingDeliveryCount: 2,
    });
    expect(realtime.publishNotificationCreated).not.toHaveBeenCalled();
  });

  it('generates message_received notifications for eligible non-sender recipients', async () => {
    const realtime = realtimeMock();
    const repository = repositoryMock({
      findSentCurrentSchoolMessageForNotificationGeneration: jest
        .fn()
        .mockResolvedValue(messageRecord()),
      resolveCurrentSchoolMessageRecipientUserIds: jest
        .fn()
        .mockReturnValue(['recipient-1', 'recipient-2', 'recipient-1']),
      createMissingMessageNotifications: jest.fn().mockResolvedValue({
        recipientCount: 2,
        createdNotificationCount: 2,
        existingNotificationCount: 0,
        createdDeliveryCount: 2,
        existingDeliveryCount: 0,
        createdNotifications: [
          generatedNotificationRecord({
            id: 'message-notification-1',
            recipientUserId: 'recipient-1',
            sourceModule: CommunicationNotificationSourceModule.COMMUNICATION,
            sourceType: 'communication_message',
            sourceId: MESSAGE_ID,
            type: CommunicationNotificationType.MESSAGE_RECEIVED,
            title: 'New message',
            body: 'Hello from the conversation',
            metadata: {
              conversationId: CONVERSATION_ID,
              messageId: MESSAGE_ID,
            },
          }),
          generatedNotificationRecord({
            id: 'message-notification-2',
            recipientUserId: 'recipient-2',
            sourceModule: CommunicationNotificationSourceModule.COMMUNICATION,
            sourceType: 'communication_message',
            sourceId: MESSAGE_ID,
            type: CommunicationNotificationType.MESSAGE_RECEIVED,
            title: 'New message',
            body: 'Hello from the conversation',
            metadata: {
              conversationId: CONVERSATION_ID,
              messageId: MESSAGE_ID,
            },
          }),
        ],
      }),
    });

    const result = await createGenerationService(
      repository,
      realtime,
    ).generateForMessageCreated({
      schoolId: SCHOOL_ID,
      messageId: MESSAGE_ID,
      actorUserId: ACTOR_ID,
    });

    expect(result).toMatchObject({
      messageId: MESSAGE_ID,
      recipientCount: 2,
      createdNotificationCount: 2,
      createdDeliveryCount: 2,
      skippedReason: null,
    });
    expect(repository.createMissingMessageNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        recipientUserIds: ['recipient-1', 'recipient-2'],
        actorUserId: ACTOR_ID,
        type: CommunicationNotificationType.MESSAGE_RECEIVED,
        title: 'New message',
        body: 'Hello from the conversation',
        priority: CommunicationNotificationPriority.NORMAL,
        metadata: {
          conversationId: CONVERSATION_ID,
          messageId: MESSAGE_ID,
          sentAt: '2026-05-03T09:02:00.000Z',
        },
        now: expect.any(Date),
      }),
    );
    expect(realtime.publishNotificationCreated).toHaveBeenCalledTimes(2);
    expect(realtime.publishNotificationCreated).toHaveBeenCalledWith(
      SCHOOL_ID,
      expect.objectContaining({
        id: 'message-notification-1',
        recipientUserId: 'recipient-1',
      }),
    );
    expect(realtime.publishNotificationCreated).toHaveBeenCalledWith(
      SCHOOL_ID,
      expect.objectContaining({
        id: 'message-notification-2',
        recipientUserId: 'recipient-2',
      }),
    );
  });

  it('uses generic safe previews for media message notifications', async () => {
    const realtime = realtimeMock();
    const repository = repositoryMock({
      findSentCurrentSchoolMessageForNotificationGeneration: jest
        .fn()
        .mockResolvedValue(
          messageRecord({
            kind: CommunicationMessageKind.IMAGE,
            body: 'caption should not leak as the notification media label',
          }),
        ),
      resolveCurrentSchoolMessageRecipientUserIds: jest
        .fn()
        .mockReturnValue(['recipient-1']),
      createMissingMessageNotifications: jest.fn().mockResolvedValue({
        recipientCount: 1,
        createdNotificationCount: 1,
        existingNotificationCount: 0,
        createdDeliveryCount: 1,
        existingDeliveryCount: 0,
        createdNotifications: [generatedNotificationRecord()],
      }),
    });

    await createGenerationService(
      repository,
      realtime,
    ).generateForMessageCreated({
      schoolId: SCHOOL_ID,
      messageId: MESSAGE_ID,
      actorUserId: ACTOR_ID,
    });

    expect(repository.createMissingMessageNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Photo',
      }),
    );
  });

  it('skips message notification generation when there are no eligible recipients', async () => {
    const realtime = realtimeMock();
    const repository = repositoryMock({
      findSentCurrentSchoolMessageForNotificationGeneration: jest
        .fn()
        .mockResolvedValue(messageRecord()),
      resolveCurrentSchoolMessageRecipientUserIds: jest.fn().mockReturnValue([]),
    });

    const result = await createGenerationService(
      repository,
      realtime,
    ).generateForMessageCreated({
      schoolId: SCHOOL_ID,
      messageId: MESSAGE_ID,
      actorUserId: ACTOR_ID,
    });

    expect(result).toMatchObject({
      messageId: MESSAGE_ID,
      skippedReason: 'no_eligible_recipients',
    });
    expect(repository.createMissingMessageNotifications).not.toHaveBeenCalled();
    expect(realtime.publishNotificationCreated).not.toHaveBeenCalled();
  });

  it('returns existing message notification counts on retry without publishing duplicate realtime events', async () => {
    const realtime = realtimeMock();
    const repository = repositoryMock({
      findSentCurrentSchoolMessageForNotificationGeneration: jest
        .fn()
        .mockResolvedValue(messageRecord()),
      resolveCurrentSchoolMessageRecipientUserIds: jest
        .fn()
        .mockReturnValue(['recipient-1']),
      createMissingMessageNotifications: jest.fn().mockResolvedValue({
        recipientCount: 1,
        createdNotificationCount: 0,
        existingNotificationCount: 1,
        createdDeliveryCount: 0,
        existingDeliveryCount: 1,
        createdNotifications: [],
      }),
    });

    const result = await createGenerationService(
      repository,
      realtime,
    ).generateForMessageCreated({
      schoolId: SCHOOL_ID,
      messageId: MESSAGE_ID,
      actorUserId: ACTOR_ID,
    });

    expect(result).toMatchObject({
      createdNotificationCount: 0,
      existingNotificationCount: 1,
      createdDeliveryCount: 0,
      existingDeliveryCount: 1,
      skippedReason: null,
    });
    expect(realtime.publishNotificationCreated).not.toHaveBeenCalled();
  });

  it('filters message recipients by notification preferences before persistence and realtime', async () => {
    const realtime = realtimeMock();
    const repository = repositoryMock({
      findSentCurrentSchoolMessageForNotificationGeneration: jest
        .fn()
        .mockResolvedValue(messageRecord()),
      resolveCurrentSchoolMessageRecipientUserIds: jest
        .fn()
        .mockReturnValue(['recipient-1', 'recipient-2']),
      createMissingMessageNotifications: jest.fn().mockResolvedValue({
        recipientCount: 1,
        createdNotificationCount: 1,
        existingNotificationCount: 0,
        createdDeliveryCount: 1,
        existingDeliveryCount: 0,
        createdNotifications: [
          generatedNotificationRecord({
            id: 'message-notification-2',
            recipientUserId: 'recipient-2',
            sourceModule: CommunicationNotificationSourceModule.COMMUNICATION,
            sourceType: 'communication_message',
            sourceId: MESSAGE_ID,
            type: CommunicationNotificationType.MESSAGE_RECEIVED,
          }),
        ],
      }),
    });
    const preferences = preferenceMock({
      filterInAppEnabledRecipientUserIds: jest
        .fn()
        .mockResolvedValue(['recipient-2']),
    });

    const result = await createGenerationService(
      repository,
      realtime,
      preferences,
    ).generateForMessageCreated({
      schoolId: SCHOOL_ID,
      messageId: MESSAGE_ID,
      actorUserId: ACTOR_ID,
    });

    expect(
      preferences.filterInAppEnabledRecipientUserIds,
    ).toHaveBeenCalledWith({
      schoolId: SCHOOL_ID,
      recipientUserIds: ['recipient-1', 'recipient-2'],
      category: 'MESSAGE_RECEIVED',
    });
    expect(repository.createMissingMessageNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserIds: ['recipient-2'],
      }),
    );
    expect(result).toMatchObject({
      recipientCount: 1,
      createdNotificationCount: 1,
      skippedReason: null,
    });
    expect(realtime.publishNotificationCreated).toHaveBeenCalledTimes(1);
    expect(realtime.publishNotificationCreated).toHaveBeenCalledWith(
      SCHOOL_ID,
      expect.objectContaining({ recipientUserId: 'recipient-2' }),
    );
  });

  it('skips message notification rows and realtime when all recipients disable the category', async () => {
    const realtime = realtimeMock();
    const repository = repositoryMock({
      findSentCurrentSchoolMessageForNotificationGeneration: jest
        .fn()
        .mockResolvedValue(messageRecord()),
      resolveCurrentSchoolMessageRecipientUserIds: jest
        .fn()
        .mockReturnValue(['recipient-1']),
    });
    const preferences = preferenceMock({
      filterInAppEnabledRecipientUserIds: jest.fn().mockResolvedValue([]),
    });

    const result = await createGenerationService(
      repository,
      realtime,
      preferences,
    ).generateForMessageCreated({
      schoolId: SCHOOL_ID,
      messageId: MESSAGE_ID,
      actorUserId: ACTOR_ID,
    });

    expect(result).toMatchObject({
      messageId: MESSAGE_ID,
      skippedReason: 'all_recipients_disabled_preferences',
    });
    expect(repository.createMissingMessageNotifications).not.toHaveBeenCalled();
    expect(realtime.publishNotificationCreated).not.toHaveBeenCalled();
  });

  it('filters announcement recipients by notification preferences before persistence and realtime', async () => {
    const realtime = realtimeMock();
    const repository = repositoryMock({
      resolveCurrentSchoolAnnouncementRecipientUserIds: jest
        .fn()
        .mockResolvedValue(['user-1', 'user-2']),
      createMissingAnnouncementPublishedNotifications: jest
        .fn()
        .mockResolvedValue({
          recipientCount: 1,
          createdNotificationCount: 1,
          existingNotificationCount: 0,
          createdDeliveryCount: 1,
          existingDeliveryCount: 0,
          createdNotifications: [
            generatedNotificationRecord({
              id: 'announcement-notification-2',
              recipientUserId: 'user-2',
            }),
          ],
        }),
    });
    const preferences = preferenceMock({
      filterInAppEnabledRecipientUserIds: jest
        .fn()
        .mockResolvedValue(['user-2']),
    });

    const result = await createGenerationService(
      repository,
      realtime,
      preferences,
    ).generateForPublishedAnnouncement(jobData());

    expect(
      preferences.filterInAppEnabledRecipientUserIds,
    ).toHaveBeenCalledWith({
      schoolId: SCHOOL_ID,
      recipientUserIds: ['user-1', 'user-2'],
      category: 'ANNOUNCEMENT',
    });
    expect(
      repository.createMissingAnnouncementPublishedNotifications,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserIds: ['user-2'],
      }),
    );
    expect(result).toMatchObject({
      recipientCount: 1,
      createdNotificationCount: 1,
      skippedReason: null,
    });
    expect(realtime.publishNotificationCreated).toHaveBeenCalledTimes(1);
    expect(realtime.publishNotificationCreated).toHaveBeenCalledWith(
      SCHOOL_ID,
      expect.objectContaining({ recipientUserId: 'user-2' }),
    );
  });
});

function repositoryMock(
  overrides?: Record<string, unknown>,
): CommunicationNotificationGenerationRepository & Record<string, jest.Mock> {
  return {
    findPublishedCurrentSchoolAnnouncementForNotificationGeneration: jest
      .fn()
      .mockResolvedValue(announcementRecord()),
    resolveCurrentSchoolAnnouncementRecipientUserIds: jest
      .fn()
      .mockResolvedValue(['user-1', 'user-2']),
    createMissingAnnouncementPublishedNotifications: jest
      .fn()
      .mockResolvedValue({
        recipientCount: 2,
        createdNotificationCount: 2,
        existingNotificationCount: 0,
        createdDeliveryCount: 2,
        existingDeliveryCount: 0,
        createdNotifications: [generatedNotificationRecord()],
      }),
    findSentCurrentSchoolMessageForNotificationGeneration: jest
      .fn()
      .mockResolvedValue(messageRecord()),
    resolveCurrentSchoolMessageRecipientUserIds: jest
      .fn()
      .mockReturnValue(['recipient-1']),
    createMissingMessageNotifications: jest.fn().mockResolvedValue({
      recipientCount: 1,
      createdNotificationCount: 1,
      existingNotificationCount: 0,
      createdDeliveryCount: 1,
      existingDeliveryCount: 0,
      createdNotifications: [generatedNotificationRecord()],
    }),
    ...(overrides ?? {}),
  } as unknown as CommunicationNotificationGenerationRepository &
    Record<string, jest.Mock>;
}

function realtimeMock(): CommunicationRealtimeEventsService &
  Record<string, jest.Mock> {
  return {
    publishNotificationCreated: jest.fn(),
  } as unknown as CommunicationRealtimeEventsService & Record<string, jest.Mock>;
}

function createGenerationService(
  repository: CommunicationNotificationGenerationRepository,
  realtime: CommunicationRealtimeEventsService,
  preferences = preferenceMock(),
): CommunicationNotificationGenerationService {
  return new CommunicationNotificationGenerationService(
    repository,
    realtime,
    preferences,
  );
}

function preferenceMock(
  overrides?: Record<string, unknown>,
): CommunicationNotificationPreferenceService & Record<string, jest.Mock> {
  return {
    filterInAppEnabledRecipientUserIds: jest.fn(async (params) =>
      params.recipientUserIds,
    ),
    shouldCreateInAppNotification: jest.fn().mockResolvedValue(true),
    getPreferencesForActor: jest.fn(),
    updatePreferencesForActor: jest.fn(),
    ...(overrides ?? {}),
  } as unknown as CommunicationNotificationPreferenceService &
    Record<string, jest.Mock>;
}

function announcementRecord(): CommunicationAnnouncementForNotificationGeneration {
  return {
    id: ANNOUNCEMENT_ID,
    schoolId: SCHOOL_ID,
    title: 'Published announcement',
    body: ' Body\nwith   spacing ',
    status: CommunicationAnnouncementStatus.PUBLISHED,
    priority: CommunicationAnnouncementPriority.HIGH,
    audienceType: CommunicationAnnouncementAudienceType.SCHOOL,
    publishedAt: new Date('2026-05-03T09:00:00.000Z'),
    expiresAt: null,
    createdById: 'creator-1',
    publishedById: ACTOR_ID,
    audiences: [],
  };
}

function jobData() {
  return {
    schoolId: SCHOOL_ID,
    organizationId: ORGANIZATION_ID,
    announcementId: ANNOUNCEMENT_ID,
    actorUserId: ACTOR_ID,
    actorUserType: UserType.SCHOOL_USER,
  };
}

function generatedNotificationRecord(
  overrides?: Partial<CommunicationGeneratedNotificationRecord>,
): CommunicationGeneratedNotificationRecord {
  return {
    id: 'notification-1',
    schoolId: SCHOOL_ID,
    recipientUserId: 'user-1',
    actorUserId: ACTOR_ID,
    sourceModule: CommunicationNotificationSourceModule.ANNOUNCEMENTS,
    sourceType: 'announcement',
    sourceId: ANNOUNCEMENT_ID,
    type: CommunicationNotificationType.ANNOUNCEMENT_PUBLISHED,
    title: 'Published announcement',
    body: 'Body with spacing',
    priority: CommunicationNotificationPriority.HIGH,
    status: CommunicationNotificationStatus.UNREAD,
    readAt: null,
    archivedAt: null,
    expiresAt: null,
    metadata: null,
    createdAt: new Date('2026-05-03T09:01:00.000Z'),
    updatedAt: new Date('2026-05-03T09:01:00.000Z'),
    ...(overrides ?? {}),
  };
}

function messageRecord(
  overrides?: Partial<CommunicationMessageForNotificationGeneration>,
): CommunicationMessageForNotificationGeneration {
  return {
    id: MESSAGE_ID,
    schoolId: SCHOOL_ID,
    conversationId: CONVERSATION_ID,
    senderUserId: ACTOR_ID,
    kind: CommunicationMessageKind.TEXT,
    status: CommunicationMessageStatus.SENT,
    body: ' Hello\nfrom   the conversation ',
    hiddenAt: null,
    deletedAt: null,
    sentAt: new Date('2026-05-03T09:02:00.000Z'),
    createdAt: new Date('2026-05-03T09:02:00.000Z'),
    conversation: {
      id: CONVERSATION_ID,
      status: CommunicationConversationStatus.ACTIVE,
      deletedAt: null,
      participants: [
        participantRecord({ userId: ACTOR_ID }),
        participantRecord({ id: 'participant-2', userId: 'recipient-1' }),
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
  return {
    id: 'participant-1',
    userId: 'recipient-1',
    role: CommunicationParticipantRole.MEMBER,
    status: CommunicationParticipantStatus.ACTIVE,
    mutedUntil: null,
    user: {
      id: 'recipient-1',
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
    ...(overrides ?? {}),
  };
}
