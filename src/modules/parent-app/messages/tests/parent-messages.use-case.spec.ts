import {
  CreateCommunicationMessageUseCase,
  GetCommunicationMessageInfoUseCase,
  GetCommunicationMessageReadersUseCase,
  MarkCommunicationConversationReadUseCase,
} from '../../../communication/application/communication-message.use-cases';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppRequiredParentException } from '../../shared/parent-app-errors';
import type { ParentAppContext } from '../../shared/parent-app.types';
import {
  GetParentMessageInfoUseCase,
  GetParentMessageReadersUseCase,
} from '../application/get-parent-message-info.use-cases';
import { ListParentMessageConversationsUseCase } from '../application/list-parent-message-conversations.use-case';
import { MarkParentConversationReadUseCase } from '../application/mark-parent-conversation-read.use-case';
import { SendParentConversationMessageUseCase } from '../application/send-parent-conversation-message.use-case';
import {
  ParentMessagesReadAdapter,
  type ParentMessageConversationListResult,
} from '../infrastructure/parent-messages-read.adapter';

describe('Parent Messages use-cases', () => {
  it('rejects non-parent actors through ParentAppAccessService', async () => {
    const { listUseCase, accessService, readAdapter } = createUseCases();
    accessService.assertCurrentParent.mockRejectedValue(
      new ParentAppRequiredParentException({ reason: 'actor_not_parent' }),
    );

    await expect(listUseCase.execute()).rejects.toMatchObject({
      code: 'parent_app.actor.required_parent',
    });
    expect(readAdapter.listConversations).not.toHaveBeenCalled();
  });

  it('lists only conversations for the current parent participant', async () => {
    const { listUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.listConversations.mockResolvedValue(listResultFixture());
    readAdapter.getUnreadSummary.mockResolvedValue({
      unreadConversationsCount: 0,
      unreadMessagesCount: 0,
    });

    await listUseCase.execute({ search: 'teacher' });

    expect(readAdapter.listConversations).toHaveBeenCalledWith({
      parentUserId: 'parent-user-1',
      filters: { search: 'teacher' },
    });
  });

  it('returns safe 404 before send/read delegation for non-participant conversations', async () => {
    const {
      sendUseCase,
      markReadUseCase,
      readersUseCase,
      infoUseCase,
      readAdapter,
      createMessageUseCase,
      markConversationReadUseCase,
      getMessageReadersUseCase,
      getMessageInfoUseCase,
    } = createUseCasesWithValidAccess();
    readAdapter.findConversationForParent.mockResolvedValue(null);

    await expect(
      sendUseCase.execute({
        conversationId: 'conversation-1',
        body: { body: 'Hello' },
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      markReadUseCase.execute('conversation-1'),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      readersUseCase.execute({
        conversationId: 'conversation-1',
        messageId: 'message-1',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      infoUseCase.execute({
        conversationId: 'conversation-1',
        messageId: 'message-1',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(createMessageUseCase.execute).not.toHaveBeenCalled();
    expect(markConversationReadUseCase.execute).not.toHaveBeenCalled();
    expect(getMessageReadersUseCase.execute).not.toHaveBeenCalled();
    expect(getMessageInfoUseCase.execute).not.toHaveBeenCalled();
  });

  it('sends text-only messages through Communication core after parent participant check', async () => {
    const { sendUseCase, readAdapter, createMessageUseCase } =
      createUseCasesWithValidAccess();
    readAdapter.findConversationForParent.mockResolvedValue(
      conversationFixture(),
    );
    createMessageUseCase.execute.mockResolvedValue({ id: 'message-1' });
    readAdapter.findMessageForParent.mockResolvedValue(messageFixture());

    await sendUseCase.execute({
      conversationId: 'conversation-1',
      body: { body: 'Hello parent chat' },
    });

    expect(createMessageUseCase.execute).toHaveBeenCalledWith(
      'conversation-1',
      { type: 'text', body: 'Hello parent chat' },
    );
  });

  it('returns parent message readers with dual aliases and no ownership override', async () => {
    const { readersUseCase, readAdapter, getMessageReadersUseCase } =
      createUseCasesWithValidAccess();
    readAdapter.findConversationForParent.mockResolvedValue(
      conversationFixture(),
    );
    readAdapter.findMessageForParent.mockResolvedValue(messageFixture());
    getMessageReadersUseCase.execute.mockResolvedValue(coreReadersFixture());

    const result = await readersUseCase.execute({
      conversationId: 'conversation-1',
      messageId: 'message-1',
      query: { limit: 10 },
    });

    expect(getMessageReadersUseCase.execute).toHaveBeenCalledWith(
      'message-1',
      { limit: 10 },
    );
    expect(result).toMatchObject({
      messageId: 'message-1',
      message_id: 'message-1',
      readCount: 2,
      read_count: 2,
      participantsCount: 3,
      participants_count: 3,
      fullyRead: true,
      fully_read: true,
      readers: [
        {
          userId: 'reader-1',
          user_id: 'reader-1',
          displayName: 'Mona Parent',
          display_name: 'Mona Parent',
          isMe: false,
          is_me: false,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('schoolId');
    expect(JSON.stringify(result)).not.toContain('recipientUserId');
  });

  it('returns parent message info through the same safe core read model', async () => {
    const { infoUseCase, readAdapter, getMessageInfoUseCase } =
      createUseCasesWithValidAccess();
    readAdapter.findConversationForParent.mockResolvedValue(
      conversationFixture(),
    );
    readAdapter.findMessageForParent.mockResolvedValue(messageFixture());
    getMessageInfoUseCase.execute.mockResolvedValue(coreInfoFixture());

    const result = await infoUseCase.execute({
      conversationId: 'conversation-1',
      messageId: 'message-1',
    });

    expect(getMessageInfoUseCase.execute).toHaveBeenCalledWith(
      'message-1',
      undefined,
    );
    expect(result.message).toMatchObject({
      messageId: 'message-1',
      message_id: 'message-1',
      body: 'Hello',
      readCount: 2,
      read_count: 2,
    });
  });
});

function createUseCases(): {
  listUseCase: ListParentMessageConversationsUseCase;
  sendUseCase: SendParentConversationMessageUseCase;
  markReadUseCase: MarkParentConversationReadUseCase;
  readersUseCase: GetParentMessageReadersUseCase;
  infoUseCase: GetParentMessageInfoUseCase;
  accessService: jest.Mocked<ParentAppAccessService>;
  readAdapter: jest.Mocked<ParentMessagesReadAdapter>;
  createMessageUseCase: jest.Mocked<CreateCommunicationMessageUseCase>;
  markConversationReadUseCase: jest.Mocked<MarkCommunicationConversationReadUseCase>;
  getMessageReadersUseCase: jest.Mocked<GetCommunicationMessageReadersUseCase>;
  getMessageInfoUseCase: jest.Mocked<GetCommunicationMessageInfoUseCase>;
} {
  const accessService = {
    assertCurrentParent: jest.fn(),
  } as unknown as jest.Mocked<ParentAppAccessService>;
  const readAdapter = {
    listConversations: jest.fn(),
    getUnreadSummary: jest.fn(),
    findConversationForParent: jest.fn(),
    findMessageForParent: jest.fn(),
    countUnreadMessagesForConversation: jest.fn(),
  } as unknown as jest.Mocked<ParentMessagesReadAdapter>;
  const createMessageUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<CreateCommunicationMessageUseCase>;
  const markConversationReadUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<MarkCommunicationConversationReadUseCase>;
  const getMessageReadersUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<GetCommunicationMessageReadersUseCase>;
  const getMessageInfoUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<GetCommunicationMessageInfoUseCase>;

  return {
    listUseCase: new ListParentMessageConversationsUseCase(
      accessService,
      readAdapter,
    ),
    sendUseCase: new SendParentConversationMessageUseCase(
      accessService,
      readAdapter,
      createMessageUseCase,
    ),
    markReadUseCase: new MarkParentConversationReadUseCase(
      accessService,
      readAdapter,
      markConversationReadUseCase,
    ),
    readersUseCase: new GetParentMessageReadersUseCase(
      accessService,
      readAdapter,
      getMessageReadersUseCase,
    ),
    infoUseCase: new GetParentMessageInfoUseCase(
      accessService,
      readAdapter,
      getMessageInfoUseCase,
    ),
    accessService,
    readAdapter,
    createMessageUseCase,
    markConversationReadUseCase,
    getMessageReadersUseCase,
    getMessageInfoUseCase,
  };
}

function createUseCasesWithValidAccess(): ReturnType<typeof createUseCases> {
  const created = createUseCases();
  created.accessService.assertCurrentParent.mockResolvedValue(contextFixture());
  return created;
}

function contextFixture(): ParentAppContext {
  return {
    parentUserId: 'parent-user-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: [],
    guardianIds: ['guardian-1'],
    children: [],
  };
}

function listResultFixture(): ParentMessageConversationListResult {
  return {
    items: [],
    total: 0,
    page: 1,
    limit: 20,
    unreadCounts: new Map(),
  };
}

function conversationFixture() {
  return {
    id: 'conversation-1',
    participants: [],
    messages: [],
    updatedAt: new Date(),
    createdAt: new Date(),
  };
}

function messageFixture() {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    senderUserId: 'parent-user-1',
    kind: 'TEXT',
    status: 'SENT',
    body: 'Hello parent chat',
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
  };
}

function coreReadersFixture() {
  return {
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
        isMe: false,
        readAt: '2026-05-02T09:00:00.000Z',
      },
    ],
    pagination: {
      page: 1,
      limit: 50,
      total: 2,
    },
  };
}

function coreInfoFixture() {
  return {
    message: {
      messageId: 'message-1',
      conversationId: 'conversation-1',
      sender: {
        userId: 'parent-user-1',
        displayName: 'Mona Parent',
        userType: 'parent',
        isMe: true,
      },
      type: 'text',
      status: 'sent',
      body: 'Hello',
      content: 'Hello',
      createdAt: '2026-05-02T08:00:00.000Z',
      readCount: 2,
    },
    readers: coreReadersFixture().readers,
    readCount: 2,
    participantsCount: 3,
    fullyRead: true,
    pagination: coreReadersFixture().pagination,
  };
}
