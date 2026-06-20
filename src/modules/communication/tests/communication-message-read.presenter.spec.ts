import {
  CommunicationMessageKind,
  CommunicationMessageStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  CommunicationConversationReadResult,
  CommunicationMessageReadersResult,
  CommunicationMessageReadResult,
  CommunicationReadSummaryResult,
} from '../infrastructure/communication-message.repository';
import {
  presentCommunicationConversationReadResult,
  presentCommunicationMessageInfo,
  presentCommunicationMessageReaders,
  presentCommunicationMessageReadReceipt,
  presentCommunicationReadSummary,
} from '../presenters/communication-message-read.presenter';

describe('communication message read presenter', () => {
  it('presents compact message read receipts without schoolId', () => {
    const presented = presentCommunicationMessageReadReceipt(readRecord());
    const json = JSON.stringify(presented);

    expect(presented).toMatchObject({
      id: 'read-1',
      conversationId: 'conversation-1',
      messageId: 'message-1',
      userId: 'actor-1',
      readAt: '2026-05-02T09:00:00.000Z',
      readCount: 2,
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('school-1');
  });

  it('presents conversation read and summary responses compactly', () => {
    expect(
      presentCommunicationConversationReadResult({
        conversationId: 'conversation-1',
        readAt: new Date('2026-05-02T09:00:00.000Z'),
        markedCount: 2,
        messages: [{ messageId: 'message-1', readCount: 3 }],
      }),
    ).toEqual({
      conversationId: 'conversation-1',
      readAt: '2026-05-02T09:00:00.000Z',
      markedCount: 2,
      messages: [{ messageId: 'message-1', readCount: 3 }],
    });

    expect(
      presentCommunicationReadSummary({
        conversationId: 'conversation-1',
        items: [{ messageId: 'message-1', readCount: 3 }],
        total: 1,
        limit: 50,
        page: 1,
      }),
    ).toEqual({
      conversationId: 'conversation-1',
      items: [{ messageId: 'message-1', readCount: 3 }],
      total: 1,
      limit: 50,
      page: 1,
    });
  });

  it('presents safe reader cards and fully-read summary without sender rows', () => {
    const presented = presentCommunicationMessageReaders(
      readersResult(),
      'reader-1',
    );
    const json = JSON.stringify(presented);

    expect(presented).toEqual({
      messageId: 'message-1',
      conversationId: 'conversation-1',
      readCount: 2,
      participantsCount: 3,
      fullyRead: true,
      readers: [
        {
          userId: 'reader-1',
          displayName: 'Mona Parent',
          userType: 'parent',
          isMe: true,
          readAt: '2026-05-02T09:00:00.000Z',
        },
        {
          userId: 'reader-2',
          displayName: 'Ahmed Teacher',
          userType: 'teacher',
          isMe: false,
          readAt: '2026-05-02T09:05:00.000Z',
        },
      ],
      pagination: {
        page: 1,
        limit: 50,
        total: 2,
      },
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('roleId');
    expect(json).not.toContain('metadata');
  });

  it('presents message info with hidden body masked', () => {
    const presented = presentCommunicationMessageInfo(
      readersResult({
        message: {
          ...readersResult().message,
          status: CommunicationMessageStatus.DELETED,
          body: 'deleted body',
          deletedAt: new Date('2026-05-02T10:00:00.000Z'),
        },
      }),
      'sender-1',
    );

    expect(presented.message).toMatchObject({
      messageId: 'message-1',
      conversationId: 'conversation-1',
      sender: {
        userId: 'sender-1',
        displayName: 'Sara Sender',
        userType: 'teacher',
        isMe: true,
      },
      status: 'deleted',
      body: null,
      content: null,
      readCount: 2,
    });
    expect(JSON.stringify(presented)).not.toContain('deleted body');
  });
});

function readRecord(): CommunicationMessageReadResult {
  return {
    id: 'read-1',
    schoolId: 'school-1',
    conversationId: 'conversation-1',
    messageId: 'message-1',
    userId: 'actor-1',
    readAt: new Date('2026-05-02T09:00:00.000Z'),
    metadata: null,
    createdAt: new Date('2026-05-02T09:00:00.000Z'),
    updatedAt: new Date('2026-05-02T09:00:00.000Z'),
    readCount: 2,
    wasCreated: true,
    isSenderRead: false,
  };
}

function readersResult(
  overrides?: Partial<CommunicationMessageReadersResult>,
): CommunicationMessageReadersResult {
  return {
    message: {
      id: 'message-1',
      conversationId: 'conversation-1',
      senderUserId: 'sender-1',
      kind: CommunicationMessageKind.TEXT,
      status: CommunicationMessageStatus.SENT,
      body: 'Hello',
      clientMessageId: 'client-1',
      replyToMessageId: null,
      editedAt: null,
      hiddenAt: null,
      deletedAt: null,
      sentAt: new Date('2026-05-02T08:00:00.000Z'),
      createdAt: new Date('2026-05-02T08:00:00.000Z'),
      updatedAt: new Date('2026-05-02T08:00:00.000Z'),
      senderUser: {
        id: 'sender-1',
        firstName: 'Sara',
        lastName: 'Sender',
        userType: UserType.TEACHER,
        status: UserStatus.ACTIVE,
      },
    },
    readers: [
      {
        id: 'read-1',
        userId: 'reader-1',
        readAt: new Date('2026-05-02T09:00:00.000Z'),
        user: {
          id: 'reader-1',
          firstName: 'Mona',
          lastName: 'Parent',
          userType: UserType.PARENT,
          status: UserStatus.ACTIVE,
        },
      },
      {
        id: 'read-2',
        userId: 'reader-2',
        readAt: new Date('2026-05-02T09:05:00.000Z'),
        user: {
          id: 'reader-2',
          firstName: 'Ahmed',
          lastName: 'Teacher',
          userType: UserType.TEACHER,
          status: UserStatus.ACTIVE,
        },
      },
    ],
    readCount: 2,
    participantsCount: 3,
    fullyRead: true,
    total: 2,
    limit: 50,
    page: 1,
    ...(overrides ?? {}),
  };
}
