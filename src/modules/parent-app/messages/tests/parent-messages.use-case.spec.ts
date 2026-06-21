import { CreateOrReuseCommunicationDirectConversationUseCase } from '../../../communication/application/communication-conversation.use-cases';
import {
  CreateCommunicationMessageUseCase,
  GetCommunicationMessageInfoUseCase,
  GetCommunicationMessageReadersUseCase,
  MarkCommunicationConversationReadUseCase,
} from '../../../communication/application/communication-message.use-cases';
import { GetCommunicationMessageAttachmentDownloadUrlUseCase } from '../../../communication/application/communication-message-attachment-download.use-case';
import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppRequiredParentException } from '../../shared/parent-app-errors';
import type { ParentAppContext } from '../../shared/parent-app.types';
import {
  GetParentMessageInfoUseCase,
  GetParentMessageReadersUseCase,
} from '../application/get-parent-message-info.use-cases';
import { GetParentMessageAttachmentDownloadUrlUseCase } from '../application/get-parent-message-attachment-download-url.use-case';
import { ListParentMessageConversationsUseCase } from '../application/list-parent-message-conversations.use-case';
import { MarkParentConversationReadUseCase } from '../application/mark-parent-conversation-read.use-case';
import {
  CreateParentMessageConversationUseCase,
  ListParentMessageContactsUseCase,
} from '../application/parent-message-contacts.use-cases';
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

  it('lists authorized parent contacts with dual aliases and no unsafe fields', async () => {
    const { contactsUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.listContactsForParent.mockResolvedValue({
      items: [
        {
          contactId: 'teacher:teacher-user-1',
          targetUserId: 'teacher-user-1',
          displayName: 'Test Teacher',
          role: 'teacher',
          avatarUrl: null,
          subtitle: 'Math - Grade 4',
          conversationId: 'conversation-1',
          canMessage: true,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });

    const result = await contactsUseCase.execute({
      q: 'test',
      role: 'teacher',
      limit: 20,
    });

    expect(readAdapter.listContactsForParent).toHaveBeenCalledWith({
      context: contextFixture(),
      filters: { q: 'test', role: 'teacher', limit: 20 },
    });
    expect(result.contacts).toEqual([
      expect.objectContaining({
        contactId: 'teacher:teacher-user-1',
        contact_id: 'teacher:teacher-user-1',
        displayName: 'Test Teacher',
        display_name: 'Test Teacher',
        conversationId: 'conversation-1',
        conversation_id: 'conversation-1',
        canMessage: true,
        can_message: true,
      }),
    ]);
    const json = JSON.stringify(result);
    expect(json).not.toContain('targetUserId');
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('membershipId');
  });

  it('creates or reuses parent direct conversation only after authorized contact resolution', async () => {
    const {
      createConversationUseCase,
      readAdapter,
      createDirectConversationUseCase,
    } = createUseCasesWithValidAccess();
    readAdapter.findContactForParent.mockResolvedValue({
      contactId: 'teacher:teacher-user-1',
      targetUserId: 'teacher-user-1',
      displayName: 'Test Teacher',
      role: 'teacher',
      avatarUrl: null,
      subtitle: 'Math',
      conversationId: null,
      canMessage: true,
    });
    createDirectConversationUseCase.execute.mockResolvedValue({
      conversationId: 'conversation-1',
      wasCreated: true,
    });
    readAdapter.findConversationForParent.mockResolvedValue(
      conversationDetailFixture(),
    );
    readAdapter.countUnreadMessagesForConversation.mockResolvedValue(0);

    const result = await createConversationUseCase.execute({
      contactId: 'teacher:teacher-user-1',
    });

    expect(readAdapter.findContactForParent).toHaveBeenCalledWith({
      context: contextFixture(),
      contactId: 'teacher:teacher-user-1',
    });
    expect(createDirectConversationUseCase.execute).toHaveBeenCalledWith({
      targetUserId: 'teacher-user-1',
    });
    expect(result.conversation).toMatchObject({
      conversationId: 'conversation-1',
      conversation_id: 'conversation-1',
      isGroup: false,
      is_group: false,
    });
  });

  it('blocks parent direct conversation creation for unauthorized contact ids', async () => {
    const {
      createConversationUseCase,
      readAdapter,
      createDirectConversationUseCase,
    } = createUseCasesWithValidAccess();
    readAdapter.findContactForParent.mockResolvedValue(null);

    await expect(
      createConversationUseCase.execute({ contactId: 'teacher:foreign' }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(createDirectConversationUseCase.execute).not.toHaveBeenCalled();
  });

  it('returns safe 404 before send/read delegation for non-participant conversations', async () => {
    const {
      sendUseCase,
      markReadUseCase,
      readersUseCase,
      infoUseCase,
      attachmentDownloadUseCase,
      readAdapter,
      createMessageUseCase,
      markConversationReadUseCase,
      getMessageReadersUseCase,
      getMessageInfoUseCase,
      getAttachmentDownloadUrlUseCase,
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
    await expect(
      attachmentDownloadUseCase.execute({
        conversationId: 'conversation-1',
        messageId: 'message-1',
        attachmentId: 'attachment-1',
        mode: 'download',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(createMessageUseCase.execute).not.toHaveBeenCalled();
    expect(markConversationReadUseCase.execute).not.toHaveBeenCalled();
    expect(getMessageReadersUseCase.execute).not.toHaveBeenCalled();
    expect(getMessageInfoUseCase.execute).not.toHaveBeenCalled();
    expect(getAttachmentDownloadUrlUseCase.execute).not.toHaveBeenCalled();
  });

  it('sends text messages through Communication core after parent participant check', async () => {
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

  it('sends image messages through Communication core and returns safe attachments', async () => {
    const { sendUseCase, readAdapter, createMessageUseCase } =
      createUseCasesWithValidAccess();
    readAdapter.findConversationForParent.mockResolvedValue(
      conversationFixture(),
    );
    createMessageUseCase.execute.mockResolvedValue({ id: 'message-1' });
    readAdapter.findMessageForParent.mockResolvedValue(
      messageFixture({
        kind: 'IMAGE',
        body: 'Photo caption',
        attachments: [attachmentFixture()],
      }),
    );

    const result = await sendUseCase.execute({
      conversationId: 'conversation-1',
      body: {
        type: 'image',
        caption: 'Photo caption',
        clientMessageId: 'client-image-1',
        attachments: [
          {
            fileId: 'file-1',
            mediaKind: 'image',
            caption: 'Photo caption',
            sortOrder: 0,
          },
        ],
      },
    });

    expect(createMessageUseCase.execute).toHaveBeenCalledWith(
      'conversation-1',
      {
        type: 'image',
        caption: 'Photo caption',
        clientMessageId: 'client-image-1',
        attachments: [
          {
            fileId: 'file-1',
            mediaKind: 'image',
            caption: 'Photo caption',
            sortOrder: 0,
          },
        ],
      },
    );
    expect(result.message).toMatchObject({
      type: 'image',
      body: 'Photo caption',
      attachmentsCount: 1,
      attachments_count: 1,
      attachments: [
        expect.objectContaining({
          attachmentId: 'attachment-1',
          attachment_id: 'attachment-1',
          fileId: 'file-1',
          file_id: 'file-1',
          mediaKind: 'image',
          media_kind: 'image',
          downloadPath: '/api/v1/files/file-1/download',
          download_path: '/api/v1/files/file-1/download',
        }),
      ],
    });
    const json = JSON.stringify(result);
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('objectKey');
    expect(json).not.toContain('signedUrl');
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

    expect(getMessageReadersUseCase.execute).toHaveBeenCalledWith('message-1', {
      limit: 10,
    });
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

  it('resolves parent message attachment download after app visibility checks', async () => {
    const {
      attachmentDownloadUseCase,
      readAdapter,
      getAttachmentDownloadUrlUseCase,
    } = createUseCasesWithValidAccess();
    readAdapter.findConversationForParent.mockResolvedValue(
      conversationFixture(),
    );
    readAdapter.findMessageForParent.mockResolvedValue(messageFixture());
    getAttachmentDownloadUrlUseCase.execute.mockResolvedValue(
      'https://storage.example/signed-download',
    );

    const result = await attachmentDownloadUseCase.execute({
      conversationId: 'conversation-1',
      messageId: 'message-1',
      attachmentId: 'attachment-1',
      mode: 'preview',
    });

    expect(result).toBe('https://storage.example/signed-download');
    expect(getAttachmentDownloadUrlUseCase.execute).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      messageId: 'message-1',
      attachmentId: 'attachment-1',
      mode: 'preview',
    });
  });

  it('does not delegate parent attachment download when message mismatches conversation', async () => {
    const {
      attachmentDownloadUseCase,
      readAdapter,
      getAttachmentDownloadUrlUseCase,
    } = createUseCasesWithValidAccess();
    readAdapter.findConversationForParent.mockResolvedValue(
      conversationFixture(),
    );
    readAdapter.findMessageForParent.mockResolvedValue(null);

    await expect(
      attachmentDownloadUseCase.execute({
        conversationId: 'conversation-1',
        messageId: 'foreign-message',
        attachmentId: 'attachment-1',
        mode: 'download',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(getAttachmentDownloadUrlUseCase.execute).not.toHaveBeenCalled();
  });
});

function createUseCases(): {
  listUseCase: ListParentMessageConversationsUseCase;
  contactsUseCase: ListParentMessageContactsUseCase;
  createConversationUseCase: CreateParentMessageConversationUseCase;
  sendUseCase: SendParentConversationMessageUseCase;
  markReadUseCase: MarkParentConversationReadUseCase;
  readersUseCase: GetParentMessageReadersUseCase;
  infoUseCase: GetParentMessageInfoUseCase;
  attachmentDownloadUseCase: GetParentMessageAttachmentDownloadUrlUseCase;
  accessService: jest.Mocked<ParentAppAccessService>;
  readAdapter: jest.Mocked<ParentMessagesReadAdapter>;
  createDirectConversationUseCase: jest.Mocked<CreateOrReuseCommunicationDirectConversationUseCase>;
  createMessageUseCase: jest.Mocked<CreateCommunicationMessageUseCase>;
  markConversationReadUseCase: jest.Mocked<MarkCommunicationConversationReadUseCase>;
  getMessageReadersUseCase: jest.Mocked<GetCommunicationMessageReadersUseCase>;
  getMessageInfoUseCase: jest.Mocked<GetCommunicationMessageInfoUseCase>;
  getAttachmentDownloadUrlUseCase: jest.Mocked<GetCommunicationMessageAttachmentDownloadUrlUseCase>;
} {
  const accessService = {
    assertCurrentParent: jest.fn(),
  } as unknown as jest.Mocked<ParentAppAccessService>;
  const readAdapter = {
    listConversations: jest.fn(),
    listContactsForParent: jest.fn(),
    findContactForParent: jest.fn(),
    getUnreadSummary: jest.fn(),
    findConversationForParent: jest.fn(),
    findMessageForParent: jest.fn(),
    countUnreadMessagesForConversation: jest.fn(),
  } as unknown as jest.Mocked<ParentMessagesReadAdapter>;
  const createDirectConversationUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<CreateOrReuseCommunicationDirectConversationUseCase>;
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
  const getAttachmentDownloadUrlUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<GetCommunicationMessageAttachmentDownloadUrlUseCase>;

  return {
    listUseCase: new ListParentMessageConversationsUseCase(
      accessService,
      readAdapter,
    ),
    contactsUseCase: new ListParentMessageContactsUseCase(
      accessService,
      readAdapter,
    ),
    createConversationUseCase: new CreateParentMessageConversationUseCase(
      accessService,
      readAdapter,
      createDirectConversationUseCase,
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
    attachmentDownloadUseCase: new GetParentMessageAttachmentDownloadUrlUseCase(
      accessService,
      readAdapter,
      getAttachmentDownloadUrlUseCase,
    ),
    accessService,
    readAdapter,
    createDirectConversationUseCase,
    createMessageUseCase,
    markConversationReadUseCase,
    getMessageReadersUseCase,
    getMessageInfoUseCase,
    getAttachmentDownloadUrlUseCase,
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

function conversationDetailFixture() {
  const now = new Date('2026-01-01T08:00:00.000Z');
  return {
    id: 'conversation-1',
    type: 'DIRECT',
    status: 'ACTIVE',
    titleEn: null,
    titleAr: null,
    descriptionEn: null,
    descriptionAr: null,
    lastMessageAt: null,
    metadata: null,
    createdAt: now,
    updatedAt: now,
    participants: [
      {
        id: 'participant-parent',
        conversationId: 'conversation-1',
        userId: 'parent-user-1',
        role: 'OWNER',
        status: 'ACTIVE',
        lastReadMessageId: null,
        lastReadAt: null,
        createdAt: now,
        updatedAt: now,
        user: {
          id: 'parent-user-1',
          firstName: 'Mona',
          lastName: 'Parent',
          userType: 'PARENT',
          status: 'ACTIVE',
        },
      },
      {
        id: 'participant-teacher',
        conversationId: 'conversation-1',
        userId: 'teacher-user-1',
        role: 'MEMBER',
        status: 'ACTIVE',
        lastReadMessageId: null,
        lastReadAt: null,
        createdAt: now,
        updatedAt: now,
        user: {
          id: 'teacher-user-1',
          firstName: 'Test',
          lastName: 'Teacher',
          userType: 'TEACHER',
          status: 'ACTIVE',
        },
      },
    ],
    messages: [],
  };
}

function messageFixture(overrides?: Record<string, unknown>) {
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
    attachments: [],
    ...(overrides ?? {}),
  };
}

function attachmentFixture() {
  return {
    id: 'attachment-1',
    fileId: 'file-1',
    caption: 'Photo caption',
    sortOrder: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    file: {
      originalName: 'photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 123n,
      visibility: 'PRIVATE',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
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
