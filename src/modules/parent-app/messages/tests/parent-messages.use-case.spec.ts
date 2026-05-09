import {
  CreateCommunicationMessageUseCase,
  MarkCommunicationConversationReadUseCase,
} from '../../../communication/application/communication-message.use-cases';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppRequiredParentException } from '../../shared/parent-app-errors';
import type { ParentAppContext } from '../../shared/parent-app.types';
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
      readAdapter,
      createMessageUseCase,
      markConversationReadUseCase,
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
    expect(createMessageUseCase.execute).not.toHaveBeenCalled();
    expect(markConversationReadUseCase.execute).not.toHaveBeenCalled();
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
});

function createUseCases(): {
  listUseCase: ListParentMessageConversationsUseCase;
  sendUseCase: SendParentConversationMessageUseCase;
  markReadUseCase: MarkParentConversationReadUseCase;
  accessService: jest.Mocked<ParentAppAccessService>;
  readAdapter: jest.Mocked<ParentMessagesReadAdapter>;
  createMessageUseCase: jest.Mocked<CreateCommunicationMessageUseCase>;
  markConversationReadUseCase: jest.Mocked<MarkCommunicationConversationReadUseCase>;
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
    accessService,
    readAdapter,
    createMessageUseCase,
    markConversationReadUseCase,
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
