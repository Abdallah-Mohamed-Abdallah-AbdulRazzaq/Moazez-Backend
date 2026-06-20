import {
  CommunicationConversationStatus,
  CommunicationConversationType,
  CommunicationMessageKind,
  CommunicationMessageStatus,
  CommunicationParticipantRole,
  CommunicationParticipantStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { ParentMessagesPresenter } from '../presenters/parent-messages.presenter';
import type {
  ParentMessageConversationRecord,
  ParentMessageRecord,
} from '../infrastructure/parent-messages-read.adapter';

describe('ParentMessagesPresenter', () => {
  it('hides hidden and deleted message body/content from parent responses', () => {
    const hidden = ParentMessagesPresenter.presentMessage({
      message: messageFixture({
        status: CommunicationMessageStatus.HIDDEN,
        hiddenAt: new Date('2026-01-01T00:01:00.000Z'),
      }),
      parentUserId: 'parent-user-1',
    });
    const deleted = ParentMessagesPresenter.presentMessage({
      message: messageFixture({
        status: CommunicationMessageStatus.DELETED,
        deletedAt: new Date('2026-01-01T00:02:00.000Z'),
      }),
      parentUserId: 'parent-user-1',
    });

    expect(hidden.message.body).toBeNull();
    expect(hidden.message.content).toBeNull();
    expect(deleted.message.body).toBeNull();
    expect(deleted.message.content).toBeNull();
  });

  it('does not expose internal moderation, report, tenant, schedule, or storage fields', () => {
    const serialized = JSON.stringify(
      ParentMessagesPresenter.presentMessage({
        message: messageFixture(),
        parentUserId: 'parent-user-1',
      }),
    );

    for (const forbidden of [
      'schoolId',
      'organizationId',
      'scheduleId',
      'hiddenReason',
      'report',
      'moderation',
      'bucket',
      'objectKey',
      'storageKey',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('presents enriched parent conversation list cards safely', () => {
    const result = ParentMessagesPresenter.presentConversationList({
      result: {
        items: [
          conversationFixture({
            type: CommunicationConversationType.CLASSROOM,
            participants: [
              participantFixture('parent-user-1', UserType.PARENT),
              participantFixture(
                'teacher-user-1',
                UserType.TEACHER,
                CommunicationParticipantStatus.MUTED,
              ),
            ],
            messages: [
              messageFixture({
                senderUserId: 'teacher-user-1',
                reads: [
                  { userId: 'teacher-user-1' },
                  { userId: 'parent-user-1' },
                ],
                _count: { reads: 2 },
              }),
            ],
          }),
        ],
        total: 1,
        page: 1,
        limit: 20,
        unreadCounts: new Map([['conversation-1', 3]]),
      },
      parentUserId: 'parent-user-1',
    });
    const card = result.conversations[0];
    const serialized = JSON.stringify(card);

    expect(card).toMatchObject({
      conversationId: 'conversation-1',
      conversation_id: 'conversation-1',
      isGroup: true,
      is_group: true,
      participantsCount: 2,
      participants_count: 2,
      unreadCount: 3,
      unread_count: 3,
      lastMessageReadCount: 1,
      last_message_read_count: 1,
    });
    expect(card.lastMessage).toMatchObject({
      id: 'message-1',
      messageId: 'message-1',
      message_id: 'message-1',
      senderType: 'other',
      sender_type: 'other',
      text: 'Visible text',
      body: 'Visible text',
      content: 'Visible text',
      readCount: 1,
      read_count: 1,
      created_at: '2026-01-01T00:00:00.000Z',
    });
    expect(card.last_message).toEqual(card.lastMessage);
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('membershipId');
    expect(serialized).not.toContain('roleId');
  });

  it('hides hidden parent last-message bodies and maps direct chats as non-group', () => {
    const result = ParentMessagesPresenter.presentConversationList({
      result: {
        items: [
          conversationFixture({
            messages: [
              messageFixture({
                status: CommunicationMessageStatus.HIDDEN,
                hiddenAt: new Date('2026-01-01T00:01:00.000Z'),
                body: 'hidden list body',
              }),
            ],
          }),
        ],
        total: 1,
        page: 1,
        limit: 20,
        unreadCounts: new Map(),
      },
      parentUserId: 'parent-user-1',
    });
    const card = result.conversations[0];

    expect(card.isGroup).toBe(false);
    expect(card.lastMessage?.body).toBeNull();
    expect(card.lastMessage?.content).toBeNull();
    expect(JSON.stringify(card)).not.toContain('hidden list body');
  });

  it('adds readCount aliases and ignores sender self-read rows', () => {
    const ownMessage = ParentMessagesPresenter.presentMessage({
      message: messageFixture({
        senderUserId: 'parent-user-1',
        reads: [{ userId: 'parent-user-1' }, { userId: 'teacher-user-1' }],
        _count: { reads: 2 },
      }),
      parentUserId: 'parent-user-1',
    });
    const receivedMessage = ParentMessagesPresenter.presentMessage({
      message: messageFixture({
        senderUserId: 'teacher-user-1',
        reads: [{ userId: 'parent-user-1' }],
        _count: { reads: 1 },
      }),
      parentUserId: 'parent-user-1',
    });

    expect(ownMessage.message).toMatchObject({
      readCount: 1,
      read_count: 1,
      isRead: true,
      is_read: true,
    });
    expect(receivedMessage.message).toMatchObject({
      readCount: 1,
      read_count: 1,
      isRead: true,
      is_read: true,
    });
  });

  it('keeps own sent messages unread when only the sender has a historical read row', () => {
    const ownMessage = ParentMessagesPresenter.presentMessage({
      message: messageFixture({
        senderUserId: 'parent-user-1',
        reads: [{ userId: 'parent-user-1' }],
        _count: { reads: 1 },
      }),
      parentUserId: 'parent-user-1',
    });

    expect(ownMessage.message.readCount).toBe(0);
    expect(ownMessage.message.read_count).toBe(0);
    expect(ownMessage.message.isRead).toBe(false);
    expect(ownMessage.message.is_read).toBe(false);
  });
});

function conversationFixture(
  overrides?: Partial<ParentMessageConversationRecord>,
): ParentMessageConversationRecord {
  return {
    id: 'conversation-1',
    type: CommunicationConversationType.DIRECT,
    status: CommunicationConversationStatus.ACTIVE,
    titleEn: null,
    titleAr: null,
    descriptionEn: null,
    descriptionAr: null,
    lastMessageAt: new Date('2026-01-01T00:00:00.000Z'),
    metadata: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    participants: [
      participantFixture('parent-user-1', UserType.PARENT),
      participantFixture('teacher-user-1', UserType.TEACHER),
    ],
    messages: [messageFixture()],
    ...(overrides ?? {}),
  } as unknown as ParentMessageConversationRecord;
}

function participantFixture(
  userId: string,
  userType: UserType,
  status: CommunicationParticipantStatus = CommunicationParticipantStatus.ACTIVE,
) {
  return {
    id: `participant-${userId}`,
    conversationId: 'conversation-1',
    userId,
    role: CommunicationParticipantRole.MEMBER,
    status,
    lastReadMessageId: null,
    lastReadAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    user: {
      id: userId,
      firstName: userType === UserType.PARENT ? 'Mona' : 'Test',
      lastName: userType === UserType.PARENT ? 'Parent' : 'Teacher',
      userType,
      status: UserStatus.ACTIVE,
    },
  };
}

function messageFixture(
  overrides?: Partial<ParentMessageRecord>,
): ParentMessageRecord {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    senderUserId: 'parent-user-1',
    kind: CommunicationMessageKind.TEXT,
    status: CommunicationMessageStatus.SENT,
    body: 'Visible text',
    replyToMessageId: null,
    editedAt: null,
    hiddenAt: null,
    deletedAt: null,
    sentAt: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    senderUser: {
      id: 'parent-user-1',
      firstName: 'Mona',
      lastName: 'Parent',
      userType: 'PARENT',
      status: 'ACTIVE',
    },
    reads: [],
    _count: { reads: 0 },
    ...overrides,
  } as unknown as ParentMessageRecord;
}
