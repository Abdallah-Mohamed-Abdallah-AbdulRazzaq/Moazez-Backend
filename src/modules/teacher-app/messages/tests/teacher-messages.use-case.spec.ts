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
import { CreateCommunicationMessageUseCase, MarkCommunicationConversationReadUseCase } from '../../../communication/application/communication-message.use-cases';
import { TeacherAppAccessService } from '../../access/teacher-app-access.service';
import { TeacherAppRequiredTeacherException } from '../../shared/teacher-app.errors';
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

  it('send delegates text-only messages to Communication core after access validation', async () => {
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

  it('send DTO rejects attachment, audio, and conversation creation fields', async () => {
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
          body: 'Hello',
          attachments: [{ fileId: 'file-1' }],
          audioUrl: 'https://example.test/audio.mp3',
          type: 'audio',
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
});

function createUseCases(): {
  listConversationsUseCase: ListTeacherMessageConversationsUseCase;
  detailUseCase: GetTeacherMessageConversationUseCase;
  listMessagesUseCase: ListTeacherConversationMessagesUseCase;
  sendUseCase: SendTeacherConversationMessageUseCase;
  readUseCase: MarkTeacherConversationReadUseCase;
  accessService: jest.Mocked<TeacherAppAccessService>;
  messagesReadAdapter: jest.Mocked<TeacherMessagesReadAdapter>;
  createCommunicationMessageUseCase: jest.Mocked<CreateCommunicationMessageUseCase>;
  markCommunicationConversationReadUseCase: jest.Mocked<MarkCommunicationConversationReadUseCase>;
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
      }),
    ),
  } as unknown as jest.Mocked<MarkCommunicationConversationReadUseCase>;

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
    accessService,
    messagesReadAdapter,
    createCommunicationMessageUseCase,
    markCommunicationConversationReadUseCase,
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
    _count: { reads: 0 },
    ...overrides,
  } as unknown as TeacherMessageRecord;
}
