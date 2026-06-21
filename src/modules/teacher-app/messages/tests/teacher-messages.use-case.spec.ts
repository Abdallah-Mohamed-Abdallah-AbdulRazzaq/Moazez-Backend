import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
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
import {
  CreateCommunicationMessageUseCase,
  GetCommunicationMessageInfoUseCase,
  GetCommunicationMessageReadersUseCase,
  MarkCommunicationConversationReadUseCase,
} from '../../../communication/application/communication-message.use-cases';
import { GetCommunicationMessageAttachmentDownloadUrlUseCase } from '../../../communication/application/communication-message-attachment-download.use-case';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherAppRequiredTeacherException } from '../../shared/teacher-app.errors';
import {
  GetTeacherMessageInfoUseCase,
  GetTeacherMessageReadersUseCase,
} from '../application/get-teacher-message-info.use-cases';
import { GetTeacherMessageAttachmentDownloadUrlUseCase } from '../application/get-teacher-message-attachment-download-url.use-case';
import { GetTeacherMessageConversationUseCase } from '../application/get-teacher-message-conversation.use-case';
import { ListTeacherConversationMessagesUseCase } from '../application/list-teacher-conversation-messages.use-case';
import { ListTeacherMessageConversationsUseCase } from '../application/list-teacher-message-conversations.use-case';
import { MarkTeacherConversationReadUseCase } from '../application/mark-teacher-conversation-read.use-case';
import { SendTeacherConversationMessageUseCase } from '../application/send-teacher-conversation-message.use-case';
import { SendTeacherConversationMessageDto } from '../dto/teacher-messages.dto';
import {
  TeacherMessageConversationRecord,
  TeacherMessageRecord,
  TeacherMessagesReadAdapter,
} from '../infrastructure/teacher-messages-read.adapter';

const TEACHER_ID = 'teacher-1';
const CONVERSATION_ID = 'conversation-1';

describe('Teacher Messages use cases', () => {
  it('conversations list rejects non-teacher actors through the access service', async () => {
    const { listConversationsUseCase, accessService } = createUseCases();
    accessService.assertCurrentTeacher.mockImplementation(() => {
      throw new TeacherAppRequiredTeacherException({
        reason: 'actor_not_teacher',
      });
    });

    await expect(listConversationsUseCase.execute({})).rejects.toBeInstanceOf(
      TeacherAppRequiredTeacherException,
    );
  });

  it('conversations list asks the read adapter for current teacher participant conversations only', async () => {
    const { listConversationsUseCase, messagesReadAdapter } = createUseCases();

    const result = await listConversationsUseCase.execute({
      type: 'direct',
      status: 'active',
      search: 'Mona',
      page: 2,
      limit: 10,
    });

    expect(result.conversations).toHaveLength(1);
    expect(messagesReadAdapter.listConversations).toHaveBeenCalledWith({
      teacherUserId: TEACHER_ID,
      filters: expect.objectContaining({
        type: CommunicationConversationType.DIRECT,
        status: CommunicationConversationStatus.ACTIVE,
        search: 'Mona',
        page: 2,
        limit: 10,
      }),
    });
  });

  it('conversation detail rejects non-participant and cross-school conversations safely', async () => {
    const { detailUseCase, messagesReadAdapter } = createUseCases();
    messagesReadAdapter.findConversationForTeacher.mockResolvedValueOnce(null);

    await expect(detailUseCase.execute('same-school-not-participant')).rejects
      .toMatchObject({
        code: 'not_found',
      });

    messagesReadAdapter.findConversationForTeacher.mockResolvedValueOnce(null);

    await expect(detailUseCase.execute('cross-school')).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('messages list rejects non-participant conversations before querying messages', async () => {
    const { listMessagesUseCase, messagesReadAdapter } = createUseCases();
    messagesReadAdapter.findConversationForTeacher.mockResolvedValueOnce(null);

    await expect(listMessagesUseCase.execute(CONVERSATION_ID, {})).rejects
      .toMatchObject({
        code: 'not_found',
      });
    expect(messagesReadAdapter.listMessages).not.toHaveBeenCalled();
  });

  it('send rejects non-participant conversations before delegating to Communication core', async () => {
    const { sendUseCase, messagesReadAdapter, createCommunicationMessageUseCase } =
      createUseCases();
    messagesReadAdapter.findConversationForTeacher.mockResolvedValueOnce(null);

    await expect(
      sendUseCase.execute(CONVERSATION_ID, { body: 'Hello' }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(createCommunicationMessageUseCase.execute).not.toHaveBeenCalled();
  });

  it('send delegates text messages to Communication core after access validation', async () => {
    const { sendUseCase, messagesReadAdapter, createCommunicationMessageUseCase } =
      createUseCases();

    const result = await sendUseCase.execute(CONVERSATION_ID, {
      body: 'Hello class',
      replyToMessageId: '11111111-1111-4111-8111-111111111111',
    });

    expect(result.message).toMatchObject({
      messageId: 'message-1',
      body: 'Hello',
    });
    expect(messagesReadAdapter.findConversationForTeacher).toHaveBeenCalledWith({
      conversationId: CONVERSATION_ID,
      teacherUserId: TEACHER_ID,
    });
    expect(createCommunicationMessageUseCase.execute).toHaveBeenCalledWith(
      CONVERSATION_ID,
      {
        type: 'text',
        body: 'Hello class',
        replyToMessageId: '11111111-1111-4111-8111-111111111111',
      },
    );
    expect(messagesReadAdapter.findMessageForTeacher).toHaveBeenCalledWith({
      conversationId: CONVERSATION_ID,
      messageId: 'message-1',
    });
  });

  it('send delegates voice media messages and returns camelCase safe attachments', async () => {
    const { sendUseCase, messagesReadAdapter, createCommunicationMessageUseCase } =
      createUseCases();
    messagesReadAdapter.findMessageForTeacher.mockResolvedValueOnce(
      messageFixture({
        kind: CommunicationMessageKind.AUDIO,
        body: 'Voice note',
        attachments: [attachmentFixture()],
      }),
    );

    const result = await sendUseCase.execute(CONVERSATION_ID, {
      type: 'voice',
      caption: 'Voice note',
      clientMessageId: 'client-voice-1',
      attachments: [
        {
          fileId: '11111111-1111-4111-8111-111111111111',
          mediaKind: 'audio',
          caption: 'Voice note',
          sortOrder: 0,
        },
      ],
    });

    expect(createCommunicationMessageUseCase.execute).toHaveBeenCalledWith(
      CONVERSATION_ID,
      {
        type: 'voice',
        caption: 'Voice note',
        clientMessageId: 'client-voice-1',
        attachments: [
          {
            fileId: '11111111-1111-4111-8111-111111111111',
            mediaKind: 'audio',
            caption: 'Voice note',
            sortOrder: 0,
          },
        ],
      },
    );
    expect(result.message).toMatchObject({
      type: 'audio',
      attachmentsCount: 1,
      attachments: [
        expect.objectContaining({
          attachmentId: 'attachment-1',
          fileId: 'file-1',
          displayName: 'voice.webm',
          originalName: 'voice.webm',
          mediaKind: 'audio',
          downloadPath: '/api/v1/files/file-1/download',
        }),
      ],
    });
    const json = JSON.stringify(result);
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('objectKey');
    expect(json).not.toContain('signedUrl');
  });

  it('send DTO accepts media fields but rejects conversation creation fields', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const metadata: ArgumentMetadata = {
      type: 'body',
      metatype: SendTeacherConversationMessageDto,
      data: '',
    };

    await expect(
      pipe.transform(
        {
          type: 'audio',
          caption: 'Voice note',
          clientMessageId: 'client-1',
          attachments: [
            {
              fileId: '11111111-1111-4111-8111-111111111111',
              mediaKind: 'audio',
              caption: 'Voice note',
              sortOrder: 0,
            },
          ],
        },
        metadata,
      ),
    ).resolves.toMatchObject({
      type: 'audio',
      caption: 'Voice note',
      attachments: [
        {
          fileId: '11111111-1111-4111-8111-111111111111',
          mediaKind: 'audio',
          caption: 'Voice note',
          sortOrder: 0,
        },
      ],
    });

    await expect(
      pipe.transform(
        {
          body: 'Hello',
          participantIds: ['user-1'],
        },
        metadata,
      ),
    ).rejects.toBeDefined();
  });

  it('read delegates to Communication core after participant access validation', async () => {
    const { readUseCase, markCommunicationConversationReadUseCase } =
      createUseCases();

    const result = await readUseCase.execute(CONVERSATION_ID);

    expect(result).toEqual({
      conversationId: CONVERSATION_ID,
      readAt: '2026-09-18T10:00:00.000Z',
      markedCount: 2,
    });
    expect(markCommunicationConversationReadUseCase.execute).toHaveBeenCalledWith(
      CONVERSATION_ID,
    );
  });

  it('message readers returns camelCase response after teacher message visibility passes', async () => {
    const {
      readersUseCase,
      messagesReadAdapter,
      getCommunicationMessageReadersUseCase,
    } = createUseCases();
    getCommunicationMessageReadersUseCase.execute.mockResolvedValue(
      coreReadersFixture(),
    );

    const result = await readersUseCase.execute({
      conversationId: CONVERSATION_ID,
      messageId: 'message-1',
      query: { limit: 10 },
    });

    expect(messagesReadAdapter.findConversationForTeacher).toHaveBeenCalledWith({
      conversationId: CONVERSATION_ID,
      teacherUserId: TEACHER_ID,
    });
    expect(getCommunicationMessageReadersUseCase.execute).toHaveBeenCalledWith(
      'message-1',
      { limit: 10 },
    );
    expect(result).toMatchObject({
      messageId: 'message-1',
      readCount: 2,
      participantsCount: 3,
      fullyRead: true,
      readers: [{ userId: 'reader-1', displayName: 'Mona Parent' }],
    });
    expect(JSON.stringify(result)).not.toContain('schoolId');
  });

  it('message info is not delegated for inaccessible teacher messages', async () => {
    const {
      infoUseCase,
      messagesReadAdapter,
      getCommunicationMessageInfoUseCase,
    } = createUseCases();
    messagesReadAdapter.findMessageForTeacher.mockResolvedValueOnce(null);

    await expect(
      infoUseCase.execute({
        conversationId: CONVERSATION_ID,
        messageId: 'missing-message',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(getCommunicationMessageInfoUseCase.execute).not.toHaveBeenCalled();
  });

  it('resolves teacher attachment download after app conversation and message checks', async () => {
    const {
      attachmentDownloadUseCase,
      getAttachmentDownloadUrlUseCase,
    } = createUseCases();
    getAttachmentDownloadUrlUseCase.execute.mockResolvedValueOnce(
      'https://storage.example/teacher-signed-download',
    );

    const result = await attachmentDownloadUseCase.execute({
      conversationId: CONVERSATION_ID,
      messageId: 'message-1',
      attachmentId: 'attachment-1',
      mode: 'download',
    });

    expect(result).toBe('https://storage.example/teacher-signed-download');
    expect(getAttachmentDownloadUrlUseCase.execute).toHaveBeenCalledWith({
      conversationId: CONVERSATION_ID,
      messageId: 'message-1',
      attachmentId: 'attachment-1',
      mode: 'download',
    });
  });

  it('does not delegate teacher attachment preview for inaccessible messages', async () => {
    const {
      attachmentDownloadUseCase,
      messagesReadAdapter,
      getAttachmentDownloadUrlUseCase,
    } = createUseCases();
    messagesReadAdapter.findMessageForTeacher.mockResolvedValueOnce(null);

    await expect(
      attachmentDownloadUseCase.execute({
        conversationId: CONVERSATION_ID,
        messageId: 'missing-message',
        attachmentId: 'attachment-1',
        mode: 'preview',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(getAttachmentDownloadUrlUseCase.execute).not.toHaveBeenCalled();
  });
});

function createUseCases(): {
  listConversationsUseCase: ListTeacherMessageConversationsUseCase;
  detailUseCase: GetTeacherMessageConversationUseCase;
  listMessagesUseCase: ListTeacherConversationMessagesUseCase;
  sendUseCase: SendTeacherConversationMessageUseCase;
  readUseCase: MarkTeacherConversationReadUseCase;
  readersUseCase: GetTeacherMessageReadersUseCase;
  infoUseCase: GetTeacherMessageInfoUseCase;
  attachmentDownloadUseCase: GetTeacherMessageAttachmentDownloadUrlUseCase;
  accessService: jest.Mocked<TeacherAppAccessService>;
  messagesReadAdapter: jest.Mocked<TeacherMessagesReadAdapter>;
  createCommunicationMessageUseCase: jest.Mocked<CreateCommunicationMessageUseCase>;
  markCommunicationConversationReadUseCase: jest.Mocked<MarkCommunicationConversationReadUseCase>;
  getCommunicationMessageReadersUseCase: jest.Mocked<GetCommunicationMessageReadersUseCase>;
  getCommunicationMessageInfoUseCase: jest.Mocked<GetCommunicationMessageInfoUseCase>;
  getAttachmentDownloadUrlUseCase: jest.Mocked<GetCommunicationMessageAttachmentDownloadUrlUseCase>;
} {
  const conversation = conversationFixture();
  const message = messageFixture();
  const accessService = {
    assertCurrentTeacher: jest.fn(() => ({
      teacherUserId: TEACHER_ID,
      schoolId: 'school-1',
      organizationId: 'org-1',
      membershipId: 'membership-1',
      roleId: 'role-1',
      permissions: [],
    })),
  } as unknown as jest.Mocked<TeacherAppAccessService>;
  const messagesReadAdapter = {
    listConversations: jest.fn(() =>
      Promise.resolve({
        items: [conversation],
        total: 1,
        page: 1,
        limit: 20,
        unreadCounts: new Map([[CONVERSATION_ID, 1]]),
      }),
    ),
    getUnreadSummary: jest.fn(() =>
      Promise.resolve({
        unreadConversationsCount: 1,
        unreadMessagesCount: 1,
      }),
    ),
    findConversationForTeacher: jest.fn(() => Promise.resolve(conversation)),
    listMessages: jest.fn(() =>
      Promise.resolve({
        conversationId: CONVERSATION_ID,
        items: [message],
        total: 1,
        page: 1,
        limit: 50,
      }),
    ),
    findMessageForTeacher: jest.fn(() => Promise.resolve(message)),
  } as unknown as jest.Mocked<TeacherMessagesReadAdapter>;
  const createCommunicationMessageUseCase = {
    execute: jest.fn(() => Promise.resolve({ id: 'message-1' })),
  } as unknown as jest.Mocked<CreateCommunicationMessageUseCase>;
  const markCommunicationConversationReadUseCase = {
    execute: jest.fn(() =>
      Promise.resolve({
        conversationId: CONVERSATION_ID,
        readAt: '2026-09-18T10:00:00.000Z',
        markedCount: 2,
        messages: [{ messageId: 'message-1', readCount: 1 }],
      }),
    ),
  } as unknown as jest.Mocked<MarkCommunicationConversationReadUseCase>;
  const getCommunicationMessageReadersUseCase = {
    execute: jest.fn(() => Promise.resolve(coreReadersFixture())),
  } as unknown as jest.Mocked<GetCommunicationMessageReadersUseCase>;
  const getCommunicationMessageInfoUseCase = {
    execute: jest.fn(() => Promise.resolve(coreInfoFixture())),
  } as unknown as jest.Mocked<GetCommunicationMessageInfoUseCase>;
  const getAttachmentDownloadUrlUseCase = {
    execute: jest.fn(() =>
      Promise.resolve('https://storage.example/teacher-signed-download'),
    ),
  } as unknown as jest.Mocked<GetCommunicationMessageAttachmentDownloadUrlUseCase>;

  return {
    listConversationsUseCase: new ListTeacherMessageConversationsUseCase(
      accessService,
      messagesReadAdapter,
    ),
    detailUseCase: new GetTeacherMessageConversationUseCase(
      accessService,
      messagesReadAdapter,
    ),
    listMessagesUseCase: new ListTeacherConversationMessagesUseCase(
      accessService,
      messagesReadAdapter,
    ),
    sendUseCase: new SendTeacherConversationMessageUseCase(
      accessService,
      messagesReadAdapter,
      createCommunicationMessageUseCase,
    ),
    readUseCase: new MarkTeacherConversationReadUseCase(
      accessService,
      messagesReadAdapter,
      markCommunicationConversationReadUseCase,
    ),
    readersUseCase: new GetTeacherMessageReadersUseCase(
      accessService,
      messagesReadAdapter,
      getCommunicationMessageReadersUseCase,
    ),
    infoUseCase: new GetTeacherMessageInfoUseCase(
      accessService,
      messagesReadAdapter,
      getCommunicationMessageInfoUseCase,
    ),
    attachmentDownloadUseCase: new GetTeacherMessageAttachmentDownloadUrlUseCase(
      accessService,
      messagesReadAdapter,
      getAttachmentDownloadUrlUseCase,
    ),
    accessService,
    messagesReadAdapter,
    createCommunicationMessageUseCase,
    markCommunicationConversationReadUseCase,
    getCommunicationMessageReadersUseCase,
    getCommunicationMessageInfoUseCase,
    getAttachmentDownloadUrlUseCase,
  };
}

function conversationFixture(): TeacherMessageConversationRecord {
  const now = new Date('2026-09-18T09:00:00.000Z');
  return {
    id: CONVERSATION_ID,
    type: CommunicationConversationType.DIRECT,
    status: CommunicationConversationStatus.ACTIVE,
    titleEn: null,
    titleAr: null,
    descriptionEn: null,
    descriptionAr: null,
    lastMessageAt: now,
    metadata: { isPinned: true },
    createdAt: now,
    updatedAt: now,
    participants: [
      participantFixture(TEACHER_ID, 'Test', 'Teacher', UserType.TEACHER, true),
      participantFixture('parent-1', 'Mona', 'Parent', UserType.PARENT, false),
    ],
    messages: [messageFixture()],
  } as unknown as TeacherMessageConversationRecord;
}

function participantFixture(
  userId: string,
  firstName: string,
  lastName: string,
  userType: UserType,
  isTeacher: boolean,
) {
  return {
    id: `participant-${userId}`,
    conversationId: CONVERSATION_ID,
    userId,
    role: isTeacher
      ? CommunicationParticipantRole.MEMBER
      : CommunicationParticipantRole.MEMBER,
    status: CommunicationParticipantStatus.ACTIVE,
    lastReadMessageId: isTeacher ? 'message-0' : null,
    lastReadAt: isTeacher ? new Date('2026-09-18T09:30:00.000Z') : null,
    createdAt: new Date('2026-09-18T08:00:00.000Z'),
    updatedAt: new Date('2026-09-18T08:00:00.000Z'),
    user: {
      id: userId,
      firstName,
      lastName,
      userType,
      status: UserStatus.ACTIVE,
    },
  };
}

function messageFixture(
  overrides?: Partial<TeacherMessageRecord>,
): TeacherMessageRecord {
  const now = new Date('2026-09-18T10:00:00.000Z');
  return {
    id: 'message-1',
    conversationId: CONVERSATION_ID,
    senderUserId: TEACHER_ID,
    kind: CommunicationMessageKind.TEXT,
    status: CommunicationMessageStatus.SENT,
    body: 'Hello',
    replyToMessageId: null,
    editedAt: null,
    hiddenAt: null,
    deletedAt: null,
    sentAt: now,
    createdAt: now,
    updatedAt: now,
    senderUser: {
      id: TEACHER_ID,
      firstName: 'Test',
      lastName: 'Teacher',
      userType: UserType.TEACHER,
      status: UserStatus.ACTIVE,
    },
    reactions: [],
    attachments: [],
    reads: [],
    _count: { reads: 0 },
    ...overrides,
  } as unknown as TeacherMessageRecord;
}

function attachmentFixture() {
  return {
    id: 'attachment-1',
    fileId: 'file-1',
    caption: 'Voice note',
    sortOrder: 0,
    createdAt: new Date('2026-09-18T10:00:00.000Z'),
    file: {
      id: 'file-1',
      originalName: 'voice.webm',
      mimeType: 'audio/webm',
      sizeBytes: 123n,
      visibility: 'PRIVATE',
      createdAt: new Date('2026-09-18T09:59:00.000Z'),
    },
  };
}

function coreReadersFixture() {
  return {
    messageId: 'message-1',
    conversationId: CONVERSATION_ID,
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
      conversationId: CONVERSATION_ID,
      sender: {
        userId: TEACHER_ID,
        displayName: 'Test Teacher',
        userType: 'teacher',
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
