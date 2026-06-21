import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { ParentMessagesReadAdapter } from '../infrastructure/parent-messages-read.adapter';

describe('ParentMessagesReadAdapter', () => {
  it('uses scoped Prisma and active parent participant filters for conversations', async () => {
    const { adapter, conversationMocks, messageMocks } = createAdapter();
    conversationMocks.findMany.mockResolvedValue([{ id: 'conversation-1' }]);
    conversationMocks.count.mockResolvedValue(0);
    messageMocks.groupBy.mockResolvedValue([]);

    await adapter.listConversations({
      parentUserId: 'parent-user-1',
      filters: { search: 'teacher' },
    });

    const query = conversationMocks.findMany.mock.calls[0][0];
    const selectJson = JSON.stringify(query.select);
    const attachmentFileSelectJson = JSON.stringify(
      query.select.messages.select.attachments.select.file.select,
    );

    expect(query.where).toMatchObject({
      deletedAt: null,
      participants: {
        some: {
          userId: 'parent-user-1',
        },
      },
    });
    expect(query.where).not.toHaveProperty('schoolId');
    expect(selectJson).toContain('participants');
    expect(selectJson).toContain('messages');
    expect(selectJson).toContain('attachments');
    expect(selectJson).toContain('originalName');
    expect(selectJson).toContain('mimeType');
    expect(selectJson).toContain('reads');
    expect(attachmentFileSelectJson).not.toContain('bucket');
    expect(attachmentFileSelectJson).not.toContain('objectKey');
    expect(attachmentFileSelectJson).not.toContain('metadata');
    expect(messageMocks.groupBy).toHaveBeenCalledTimes(1);
  });

  it('does not create conversations, participants, attachments, or bypass scope', async () => {
    const {
      adapter,
      conversationMocks,
      messageMocks,
      mutationMocks,
      platformBypass,
    } = createAdapter();
    conversationMocks.findFirst.mockResolvedValue(null);
    messageMocks.findMany.mockResolvedValue([]);
    messageMocks.count.mockResolvedValue(0);

    await adapter.findConversationForParent({
      conversationId: 'conversation-1',
      parentUserId: 'parent-user-1',
    });
    await adapter.listMessages({ conversationId: 'conversation-1' });

    for (const mutation of Object.values(mutationMocks)) {
      expect(mutation).not.toHaveBeenCalled();
    }
    expect(platformBypass).not.toHaveBeenCalled();
  });
});

function modelMocks() {
  return {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
}

function createAdapter(): {
  adapter: ParentMessagesReadAdapter;
  conversationMocks: ReturnType<typeof modelMocks>;
  messageMocks: ReturnType<typeof modelMocks>;
  mutationMocks: Record<string, jest.Mock>;
  platformBypass: jest.Mock;
} {
  const conversationMocks = modelMocks();
  const messageMocks = modelMocks();
  const participantMocks = modelMocks();
  const attachmentMocks = modelMocks();
  const platformBypass = jest.fn();
  const prisma = {
    platformBypass,
    scoped: {
      communicationConversation: conversationMocks,
      communicationMessage: messageMocks,
      communicationConversationParticipant: participantMocks,
      communicationMessageAttachment: attachmentMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new ParentMessagesReadAdapter(prisma),
    conversationMocks,
    messageMocks,
    mutationMocks: {
      conversationCreate: conversationMocks.create,
      participantCreate: participantMocks.create,
      attachmentCreate: attachmentMocks.create,
      messageAttachmentCreate: attachmentMocks.create,
    },
    platformBypass,
  };
}
