import {
  CommunicationConversationStatus,
  CommunicationConversationType,
  CommunicationMessageKind,
  CommunicationMessageStatus,
  CommunicationParticipantStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { StudentMessagesReadAdapter } from '../infrastructure/student-messages-read.adapter';

describe('StudentMessagesReadAdapter', () => {
  it('lists only active participant conversations for the current student user', async () => {
    const { adapter, conversationMocks, messageMocks } = createAdapter();
    conversationMocks.findMany.mockResolvedValue([]);
    conversationMocks.count.mockResolvedValue(0);
    messageMocks.groupBy.mockResolvedValue([]);

    await adapter.listConversations({
      studentUserId: 'student-user-1',
      filters: {
        type: CommunicationConversationType.DIRECT,
        status: CommunicationConversationStatus.ACTIVE,
        search: 'teacher',
      },
    });

    const query = conversationMocks.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      type: CommunicationConversationType.DIRECT,
      status: CommunicationConversationStatus.ACTIVE,
      deletedAt: null,
      participants: {
        some: {
          userId: 'student-user-1',
          status: {
            in: [
              CommunicationParticipantStatus.ACTIVE,
              CommunicationParticipantStatus.MUTED,
            ],
          },
        },
      },
    });
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('lists messages inside an already authorized conversation only', async () => {
    const { adapter, messageMocks } = createAdapter();
    messageMocks.findMany.mockResolvedValue([]);
    messageMocks.count.mockResolvedValue(0);

    await adapter.listMessages({
      conversationId: 'conversation-1',
      filters: { kind: CommunicationMessageKind.TEXT },
    });

    expect(messageMocks.findMany.mock.calls[0][0].where).toEqual({
      conversationId: 'conversation-1',
      kind: CommunicationMessageKind.TEXT,
    });
  });

  it('does not create conversations or use platform bypass', async () => {
    const { adapter, conversationMocks, messageMocks, platformBypass } =
      createAdapter();
    conversationMocks.findMany.mockResolvedValue([]);
    conversationMocks.count.mockResolvedValue(0);
    messageMocks.groupBy.mockResolvedValue([]);

    await adapter.listConversations({ studentUserId: 'student-user-1' });

    expect(conversationMocks.create).not.toHaveBeenCalled();
    expect(conversationMocks.update).not.toHaveBeenCalled();
    expect(conversationMocks.delete).not.toHaveBeenCalled();
    expect(messageMocks.create).not.toHaveBeenCalled();
    expect(platformBypass).not.toHaveBeenCalled();
  });

  it('counts unread only for messages not read by the student', async () => {
    const { adapter, messageMocks } = createAdapter();
    messageMocks.groupBy.mockResolvedValue([
      { conversationId: 'conversation-1', _count: { _all: 2 } },
    ]);

    await adapter.getUnreadSummary({ studentUserId: 'student-user-1' });

    expect(messageMocks.groupBy.mock.calls[0][0].where).toMatchObject({
      status: CommunicationMessageStatus.SENT,
      senderUserId: { not: 'student-user-1' },
      reads: {
        none: {
          userId: 'student-user-1',
        },
      },
    });
  });
});

function modelMocks() {
  return {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

function createAdapter(): {
  adapter: StudentMessagesReadAdapter;
  conversationMocks: ReturnType<typeof modelMocks>;
  messageMocks: ReturnType<typeof modelMocks>;
  platformBypass: jest.Mock;
} {
  const conversationMocks = modelMocks();
  const messageMocks = modelMocks();
  const platformBypass = jest.fn();
  const prisma = {
    platformBypass,
    scoped: {
      communicationConversation: conversationMocks,
      communicationMessage: messageMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new StudentMessagesReadAdapter(prisma),
    conversationMocks,
    messageMocks,
    platformBypass,
  };
}
