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
import { StudentMessagesPresenter } from '../presenters/student-messages.presenter';

describe('StudentMessagesPresenter', () => {
  it('hides body/content for hidden and deleted messages', () => {
    const result = StudentMessagesPresenter.presentMessageList({
      result: {
        conversationId: 'conversation-1',
        items: [
          messageFixture({
            id: 'message-hidden',
            status: CommunicationMessageStatus.HIDDEN,
            body: 'hidden raw body',
          }),
          messageFixture({
            id: 'message-deleted',
            status: CommunicationMessageStatus.DELETED,
            body: 'deleted raw body',
          }),
          messageFixture({
            id: 'message-visible',
            status: CommunicationMessageStatus.SENT,
            body: 'visible body',
          }),
        ] as any,
        total: 3,
        page: 1,
        limit: 50,
      },
      studentUserId: 'student-user-1',
    });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('hidden raw body');
    expect(serialized).not.toContain('deleted raw body');
    expect(serialized).toContain('visible body');
  });

  it('presents conversations without attachments, storage keys, or school ids', () => {
    const result = StudentMessagesPresenter.presentConversationList({
      result: {
        items: [conversationFixture() as any],
        total: 1,
        page: 1,
        limit: 20,
        unreadCounts: new Map([['conversation-1', 2]]),
      },
      studentUserId: 'student-user-1',
    });
    const serialized = JSON.stringify(result);

    expect(result.conversations[0]).toMatchObject({
      conversationId: 'conversation-1',
      unreadCount: 2,
      avatar_url: null,
    });
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('scheduleId');
    expect(serialized).not.toContain('bucket');
    expect(serialized).not.toContain('objectKey');
    expect(serialized).not.toContain('attachments');
  });
});

function conversationFixture() {
  return {
    id: 'conversation-1',
    type: CommunicationConversationType.DIRECT,
    status: CommunicationConversationStatus.ACTIVE,
    titleEn: null,
    titleAr: null,
    descriptionEn: null,
    descriptionAr: null,
    lastMessageAt: new Date('2026-01-01T08:00:00.000Z'),
    metadata: null,
    createdAt: new Date('2026-01-01T08:00:00.000Z'),
    updatedAt: new Date('2026-01-01T08:00:00.000Z'),
    participants: [
      participantFixture('student-user-1', UserType.STUDENT),
      participantFixture('teacher-user-1', UserType.TEACHER),
    ],
    messages: [messageFixture({ id: 'message-1', body: 'Hello' })],
  };
}

function participantFixture(userId: string, userType: UserType) {
  return {
    id: `participant-${userId}`,
    conversationId: 'conversation-1',
    userId,
    role: CommunicationParticipantRole.MEMBER,
    status: CommunicationParticipantStatus.ACTIVE,
    lastReadMessageId: null,
    lastReadAt: null,
    createdAt: new Date('2026-01-01T08:00:00.000Z'),
    updatedAt: new Date('2026-01-01T08:00:00.000Z'),
    user: {
      id: userId,
      firstName: userType === UserType.STUDENT ? 'Student' : 'Teacher',
      lastName: 'User',
      userType,
      status: UserStatus.ACTIVE,
    },
  };
}

function messageFixture(params: {
  id: string;
  status?: CommunicationMessageStatus;
  body?: string;
}) {
  return {
    id: params.id,
    conversationId: 'conversation-1',
    senderUserId: 'teacher-user-1',
    kind: CommunicationMessageKind.TEXT,
    status: params.status ?? CommunicationMessageStatus.SENT,
    body: params.body ?? 'Hello',
    replyToMessageId: null,
    editedAt: null,
    hiddenAt:
      params.status === CommunicationMessageStatus.HIDDEN
        ? new Date('2026-01-01T08:00:00.000Z')
        : null,
    deletedAt:
      params.status === CommunicationMessageStatus.DELETED
        ? new Date('2026-01-01T08:00:00.000Z')
        : null,
    sentAt: new Date('2026-01-01T08:00:00.000Z'),
    createdAt: new Date('2026-01-01T08:00:00.000Z'),
    updatedAt: new Date('2026-01-01T08:00:00.000Z'),
    senderUser: {
      id: 'teacher-user-1',
      firstName: 'Teacher',
      lastName: 'User',
      userType: UserType.TEACHER,
      status: UserStatus.ACTIVE,
    },
    reads: [],
    _count: { reads: 0 },
  };
}
