import {
  CommunicationConversationStatus,
  CommunicationConversationType,
  CommunicationMessageKind,
  CommunicationMessageStatus,
  CommunicationParticipantStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { TeacherMessagesReadAdapter } from '../infrastructure/teacher-messages-read.adapter';

describe('TeacherMessagesReadAdapter', () => {
  it('lists only current teacher participant conversations through scoped Prisma without hand-crafted schoolId', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.communicationConversation.findMany.mockResolvedValue([]);
    prismaMocks.communicationConversation.count.mockResolvedValue(0);
    prismaMocks.communicationMessage.groupBy.mockResolvedValue([]);

    await adapter.listConversations({
      teacherUserId: 'teacher-1',
      filters: {
        type: CommunicationConversationType.DIRECT,
        status: CommunicationConversationStatus.ACTIVE,
        search: 'Mona',
        page: 2,
        limit: 10,
      },
    });

    const query = prismaMocks.communicationConversation.findMany.mock.calls[0][0];
    const whereJson = JSON.stringify(query.where);

    expect(query.take).toBe(10);
    expect(query.skip).toBe(10);
    expect(query.where).toMatchObject({
      type: CommunicationConversationType.DIRECT,
      status: CommunicationConversationStatus.ACTIVE,
      participants: {
        some: {
          userId: 'teacher-1',
          status: {
            in: [
              CommunicationParticipantStatus.ACTIVE,
              CommunicationParticipantStatus.MUTED,
            ],
          },
        },
      },
    });
    expect(whereJson).toContain('Mona');
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('validates conversation detail by teacher participant access', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.communicationConversation.findFirst.mockResolvedValue(null);

    await adapter.findConversationForTeacher({
      conversationId: 'conversation-1',
      teacherUserId: 'teacher-1',
    });

    const query =
      prismaMocks.communicationConversation.findFirst.mock.calls[0][0];
    expect(query.where).toMatchObject({
      id: 'conversation-1',
      participants: {
        some: expect.objectContaining({
          userId: 'teacher-1',
        }),
      },
    });
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('lists messages and selects safe attachment metadata only', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.communicationMessage.findMany.mockResolvedValue([]);
    prismaMocks.communicationMessage.count.mockResolvedValue(0);

    await adapter.listMessages({
      conversationId: 'conversation-1',
      filters: {
        kind: CommunicationMessageKind.TEXT,
        before: new Date('2026-09-18T12:00:00.000Z'),
        page: 2,
        limit: 25,
      },
    });

    const query = prismaMocks.communicationMessage.findMany.mock.calls[0][0];
    const selectJson = JSON.stringify(query.select);

    expect(query.where).toMatchObject({
      conversationId: 'conversation-1',
      kind: CommunicationMessageKind.TEXT,
    });
    expect(query.take).toBe(25);
    expect(query.skip).toBe(25);
    expect(selectJson).toContain('attachments');
    expect(selectJson).toContain('originalName');
    expect(selectJson).toContain('mimeType');
    expect(selectJson).not.toContain('bucket');
    expect(selectJson).not.toContain('objectKey');
    expect(selectJson).not.toContain('metadata');
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('derives unread summaries from participant conversations only', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.communicationMessage.groupBy.mockResolvedValue([
      {
        conversationId: 'conversation-1',
        _count: { _all: 3 },
      },
      {
        conversationId: 'conversation-2',
        _count: { _all: 2 },
      },
    ]);

    const result = await adapter.getUnreadSummary({
      teacherUserId: 'teacher-1',
    });

    const query = prismaMocks.communicationMessage.groupBy.mock.calls[0][0];
    expect(result).toEqual({
      unreadConversationsCount: 2,
      unreadMessagesCount: 5,
    });
    expect(query.where).toMatchObject({
      status: CommunicationMessageStatus.SENT,
      senderUserId: { not: 'teacher-1' },
      conversation: {
        is: {
          deletedAt: null,
          participants: {
            some: expect.objectContaining({
              userId: 'teacher-1',
            }),
          },
        },
      },
    });
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('remains read-only', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.communicationConversation.findMany.mockResolvedValue([]);
    prismaMocks.communicationConversation.count.mockResolvedValue(0);
    prismaMocks.communicationConversation.findFirst.mockResolvedValue(null);
    prismaMocks.communicationMessage.findMany.mockResolvedValue([]);
    prismaMocks.communicationMessage.count.mockResolvedValue(0);
    prismaMocks.communicationMessage.findFirst.mockResolvedValue(null);
    prismaMocks.communicationMessage.groupBy.mockResolvedValue([]);

    await adapter.listConversations({ teacherUserId: 'teacher-1' });
    await adapter.findConversationForTeacher({
      conversationId: 'conversation-1',
      teacherUserId: 'teacher-1',
    });
    await adapter.listMessages({ conversationId: 'conversation-1' });
    await adapter.findMessageForTeacher({
      conversationId: 'conversation-1',
      messageId: 'message-1',
    });
    await adapter.getUnreadSummary({ teacherUserId: 'teacher-1' });

    expect(prismaMocks.communicationConversation.create).not.toHaveBeenCalled();
    expect(prismaMocks.communicationConversation.update).not.toHaveBeenCalled();
    expect(prismaMocks.communicationMessage.create).not.toHaveBeenCalled();
    expect(prismaMocks.communicationMessage.update).not.toHaveBeenCalled();
    expect(prismaMocks.communicationConversationParticipant.create).not.toHaveBeenCalled();
  });
});

function createAdapter(): {
  adapter: TeacherMessagesReadAdapter;
  prismaMocks: {
    communicationConversation: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    communicationMessage: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      groupBy: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    communicationConversationParticipant: {
      create: jest.Mock;
    };
  };
} {
  const prismaMocks = {
    communicationConversation: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    communicationMessage: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      groupBy: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    communicationConversationParticipant: {
      create: jest.fn(),
    },
  };
  const prisma = {
    scoped: prismaMocks,
  } as unknown as PrismaService;

  return {
    adapter: new TeacherMessagesReadAdapter(prisma),
    prismaMocks,
  };
}
