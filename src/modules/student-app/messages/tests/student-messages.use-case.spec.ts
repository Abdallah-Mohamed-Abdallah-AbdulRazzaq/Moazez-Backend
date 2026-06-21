import {
  CommunicationConversationStatus,
  CommunicationConversationType,
  CommunicationMessageKind,
  CommunicationMessageStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAppRequiredStudentException } from '../../shared/student-app-errors';
import type {
  StudentAppContext,
  StudentAppCurrentStudentWithEnrollment,
} from '../../shared/student-app.types';
import { CreateOrReuseCommunicationDirectConversationUseCase } from '../../../communication/application/communication-conversation.use-cases';
import {
  CreateCommunicationMessageUseCase,
  GetCommunicationMessageInfoUseCase,
  GetCommunicationMessageReadersUseCase,
  MarkCommunicationConversationReadUseCase,
} from '../../../communication/application/communication-message.use-cases';
import { GetCommunicationMessageAttachmentDownloadUrlUseCase } from '../../../communication/application/communication-message-attachment-download.use-case';
import { GetStudentMessageAttachmentDownloadUrlUseCase } from '../application/get-student-message-attachment-download-url.use-case';
import {
  GetStudentMessageInfoUseCase,
  GetStudentMessageReadersUseCase,
} from '../application/get-student-message-info.use-cases';
import { ListStudentMessageConversationsUseCase } from '../application/list-student-message-conversations.use-case';
import { ListStudentConversationMessagesUseCase } from '../application/list-student-conversation-messages.use-case';
import { SendStudentConversationMessageUseCase } from '../application/send-student-conversation-message.use-case';
import { MarkStudentConversationReadUseCase } from '../application/mark-student-conversation-read.use-case';
import {
  CreateStudentMessageConversationUseCase,
  ListStudentMessageContactsUseCase,
} from '../application/student-message-contacts.use-cases';
import { StudentMessagesReadAdapter } from '../infrastructure/student-messages-read.adapter';

describe('Student Messages use-cases', () => {
  it('rejects non-student actors through StudentAppAccessService', async () => {
    const { listUseCase, accessService, readAdapter } = createUseCases();
    accessService.getCurrentStudentWithEnrollment.mockRejectedValue(
      new StudentAppRequiredStudentException({ reason: 'actor_not_student' }),
    );

    await expect(listUseCase.execute()).rejects.toMatchObject({
      code: 'student_app.actor.required_student',
    });
    expect(readAdapter.listConversations).not.toHaveBeenCalled();
  });

  it('requires participant visibility before listing messages', async () => {
    const { messagesUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.findConversationForStudent.mockResolvedValue(null);

    await expect(
      messagesUseCase.execute({ conversationId: 'conversation-1' }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(readAdapter.listMessages).not.toHaveBeenCalled();
  });

  it('delegates text sends to Communication core after visibility passes', async () => {
    const { sendUseCase, readAdapter, createCommunicationMessageUseCase } =
      createUseCasesWithValidAccess();
    readAdapter.findConversationForStudent.mockResolvedValue(
      conversationFixture() as any,
    );
    createCommunicationMessageUseCase.execute.mockResolvedValue({
      id: 'message-1',
    });
    readAdapter.findMessageForStudent.mockResolvedValue(
      messageFixture() as any,
    );

    await sendUseCase.execute({
      conversationId: 'conversation-1',
      body: { body: 'Hello' },
    });

    expect(createCommunicationMessageUseCase.execute).toHaveBeenCalledWith(
      'conversation-1',
      {
        type: 'text',
        body: 'Hello',
      },
    );
  });

  it('lists authorized student contacts with dual aliases and no unsafe fields', async () => {
    const { contactsUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.listContactsForStudent.mockResolvedValue({
      items: [
        {
          contactId: 'teacher:teacher-user-1',
          targetUserId: 'teacher-user-1',
          displayName: 'Test Teacher',
          role: 'teacher',
          avatarUrl: null,
          subtitle: 'Math - Grade 4',
          conversationId: null,
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

    expect(readAdapter.listContactsForStudent).toHaveBeenCalledWith({
      context: contextFixture(),
      filters: { q: 'test', role: 'teacher', limit: 20 },
    });
    expect(result.contacts).toEqual([
      expect.objectContaining({
        contactId: 'teacher:teacher-user-1',
        contact_id: 'teacher:teacher-user-1',
        displayName: 'Test Teacher',
        display_name: 'Test Teacher',
        canMessage: true,
        can_message: true,
      }),
    ]);
    const json = JSON.stringify(result);
    expect(json).not.toContain('targetUserId');
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('membershipId');
  });

  it('creates or reuses student direct conversation only for an authorized contact', async () => {
    const {
      createConversationUseCase,
      readAdapter,
      createDirectConversationUseCase,
    } = createUseCasesWithValidAccess();
    readAdapter.findContactForStudent.mockResolvedValue({
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
    readAdapter.findConversationForStudent.mockResolvedValue(
      conversationDetailFixture() as any,
    );
    readAdapter.countUnreadMessagesForConversation.mockResolvedValue(0);

    const result = await createConversationUseCase.execute({
      contactId: 'teacher:teacher-user-1',
    });

    expect(createDirectConversationUseCase.execute).toHaveBeenCalledWith({
      targetUserId: 'teacher-user-1',
    });
    expect(result.conversation).toMatchObject({
      conversation_id: 'conversation-1',
      is_group: false,
    });
  });

  it('blocks student direct conversation creation for unauthorized contact ids', async () => {
    const {
      createConversationUseCase,
      readAdapter,
      createDirectConversationUseCase,
    } = createUseCasesWithValidAccess();
    readAdapter.findContactForStudent.mockResolvedValue(null);

    await expect(
      createConversationUseCase.execute({ contactId: 'teacher:foreign' }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(createDirectConversationUseCase.execute).not.toHaveBeenCalled();
  });

  it('delegates file sends to Communication core and returns safe dual-alias attachments', async () => {
    const { sendUseCase, readAdapter, createCommunicationMessageUseCase } =
      createUseCasesWithValidAccess();
    readAdapter.findConversationForStudent.mockResolvedValue(
      conversationFixture() as any,
    );
    createCommunicationMessageUseCase.execute.mockResolvedValue({
      id: 'message-1',
    });
    readAdapter.findMessageForStudent.mockResolvedValue(
      messageFixture({
        kind: CommunicationMessageKind.FILE,
        body: 'Homework PDF',
        attachments: [attachmentFixture()],
      }) as any,
    );

    const result = await sendUseCase.execute({
      conversationId: 'conversation-1',
      body: {
        type: 'file',
        body: 'Homework PDF',
        attachments: [
          {
            fileId: 'file-1',
            mediaKind: 'file',
            caption: 'Homework PDF',
            sortOrder: 0,
          },
        ],
      },
    });

    expect(createCommunicationMessageUseCase.execute).toHaveBeenCalledWith(
      'conversation-1',
      {
        type: 'file',
        body: 'Homework PDF',
        attachments: [
          {
            fileId: 'file-1',
            mediaKind: 'file',
            caption: 'Homework PDF',
            sortOrder: 0,
          },
        ],
      },
    );
    expect(result.message).toMatchObject({
      type: 'file',
      attachmentsCount: 1,
      attachments_count: 1,
      attachments: [
        expect.objectContaining({
          attachmentId: 'attachment-1',
          attachment_id: 'attachment-1',
          fileId: 'file-1',
          file_id: 'file-1',
          mediaKind: 'file',
          media_kind: 'file',
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

  it('delegates read marking to Communication core after visibility passes', async () => {
    const {
      readUseCase,
      readAdapter,
      markCommunicationConversationReadUseCase,
    } = createUseCasesWithValidAccess();
    readAdapter.findConversationForStudent.mockResolvedValue(
      conversationFixture() as any,
    );
    markCommunicationConversationReadUseCase.execute.mockResolvedValue({
      conversationId: 'conversation-1',
      readAt: '2026-01-01T08:00:00.000Z',
      markedCount: 1,
      messages: [{ messageId: 'message-1', readCount: 1 }],
    });

    await readUseCase.execute('conversation-1');

    expect(
      markCommunicationConversationReadUseCase.execute,
    ).toHaveBeenCalledWith('conversation-1');
  });

  it('returns student message readers with dual aliases after message visibility passes', async () => {
    const { readersUseCase, readAdapter, getMessageReadersUseCase } =
      createUseCasesWithValidAccess();
    readAdapter.findConversationForStudent.mockResolvedValue(
      conversationFixture() as any,
    );
    readAdapter.findMessageForStudent.mockResolvedValue(
      messageFixture() as any,
    );
    getMessageReadersUseCase.execute.mockResolvedValue(coreReadersFixture());

    const result = await readersUseCase.execute({
      conversationId: 'conversation-1',
      messageId: 'message-1',
      query: { page: 1 },
    });

    expect(getMessageReadersUseCase.execute).toHaveBeenCalledWith('message-1', {
      page: 1,
    });
    expect(result).toMatchObject({
      message_id: 'message-1',
      read_count: 2,
      participants_count: 3,
      fully_read: true,
      readers: [
        {
          user_id: 'reader-1',
          display_name: 'Mona Parent',
          user_type: 'parent',
          is_me: false,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('schoolId');
  });

  it('does not delegate student message info when the message is not visible', async () => {
    const { infoUseCase, readAdapter, getMessageInfoUseCase } =
      createUseCasesWithValidAccess();
    readAdapter.findConversationForStudent.mockResolvedValue(
      conversationFixture() as any,
    );
    readAdapter.findMessageForStudent.mockResolvedValue(null);

    await expect(
      infoUseCase.execute({
        conversationId: 'conversation-1',
        messageId: 'missing-message',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(getMessageInfoUseCase.execute).not.toHaveBeenCalled();
  });

  it('resolves student attachment preview only after message visibility passes', async () => {
    const {
      attachmentDownloadUseCase,
      readAdapter,
      getAttachmentDownloadUrlUseCase,
    } = createUseCasesWithValidAccess();
    readAdapter.findConversationForStudent.mockResolvedValue(
      conversationFixture() as any,
    );
    readAdapter.findMessageForStudent.mockResolvedValue(
      messageFixture() as any,
    );
    getAttachmentDownloadUrlUseCase.execute.mockResolvedValue(
      'https://storage.example/student-signed-download',
    );

    const result = await attachmentDownloadUseCase.execute({
      conversationId: 'conversation-1',
      messageId: 'message-1',
      attachmentId: 'attachment-1',
      mode: 'preview',
    });

    expect(result).toBe('https://storage.example/student-signed-download');
    expect(getAttachmentDownloadUrlUseCase.execute).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      messageId: 'message-1',
      attachmentId: 'attachment-1',
      mode: 'preview',
    });
  });

  it('does not delegate student attachment download for message mismatch', async () => {
    const {
      attachmentDownloadUseCase,
      readAdapter,
      getAttachmentDownloadUrlUseCase,
    } = createUseCasesWithValidAccess();
    readAdapter.findConversationForStudent.mockResolvedValue(
      conversationFixture() as any,
    );
    readAdapter.findMessageForStudent.mockResolvedValue(null);

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
  listUseCase: ListStudentMessageConversationsUseCase;
  messagesUseCase: ListStudentConversationMessagesUseCase;
  contactsUseCase: ListStudentMessageContactsUseCase;
  createConversationUseCase: CreateStudentMessageConversationUseCase;
  sendUseCase: SendStudentConversationMessageUseCase;
  readUseCase: MarkStudentConversationReadUseCase;
  readersUseCase: GetStudentMessageReadersUseCase;
  infoUseCase: GetStudentMessageInfoUseCase;
  attachmentDownloadUseCase: GetStudentMessageAttachmentDownloadUrlUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  readAdapter: jest.Mocked<StudentMessagesReadAdapter>;
  createDirectConversationUseCase: jest.Mocked<CreateOrReuseCommunicationDirectConversationUseCase>;
  createCommunicationMessageUseCase: jest.Mocked<CreateCommunicationMessageUseCase>;
  markCommunicationConversationReadUseCase: jest.Mocked<MarkCommunicationConversationReadUseCase>;
  getMessageReadersUseCase: jest.Mocked<GetCommunicationMessageReadersUseCase>;
  getMessageInfoUseCase: jest.Mocked<GetCommunicationMessageInfoUseCase>;
  getAttachmentDownloadUrlUseCase: jest.Mocked<GetCommunicationMessageAttachmentDownloadUrlUseCase>;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest.fn(),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const readAdapter = {
    listConversations: jest.fn(),
    listContactsForStudent: jest.fn(),
    findContactForStudent: jest.fn(),
    getUnreadSummary: jest.fn(),
    findConversationForStudent: jest.fn(),
    listMessages: jest.fn(),
    findMessageForStudent: jest.fn(),
    countUnreadMessagesForConversation: jest.fn(),
  } as unknown as jest.Mocked<StudentMessagesReadAdapter>;
  const createDirectConversationUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<CreateOrReuseCommunicationDirectConversationUseCase>;
  const createCommunicationMessageUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<CreateCommunicationMessageUseCase>;
  const markCommunicationConversationReadUseCase = {
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
    listUseCase: new ListStudentMessageConversationsUseCase(
      accessService,
      readAdapter,
    ),
    messagesUseCase: new ListStudentConversationMessagesUseCase(
      accessService,
      readAdapter,
    ),
    contactsUseCase: new ListStudentMessageContactsUseCase(
      accessService,
      readAdapter,
    ),
    createConversationUseCase: new CreateStudentMessageConversationUseCase(
      accessService,
      readAdapter,
      createDirectConversationUseCase,
    ),
    sendUseCase: new SendStudentConversationMessageUseCase(
      accessService,
      readAdapter,
      createCommunicationMessageUseCase,
    ),
    readUseCase: new MarkStudentConversationReadUseCase(
      accessService,
      readAdapter,
      markCommunicationConversationReadUseCase,
    ),
    readersUseCase: new GetStudentMessageReadersUseCase(
      accessService,
      readAdapter,
      getMessageReadersUseCase,
    ),
    infoUseCase: new GetStudentMessageInfoUseCase(
      accessService,
      readAdapter,
      getMessageInfoUseCase,
    ),
    attachmentDownloadUseCase:
      new GetStudentMessageAttachmentDownloadUrlUseCase(
        accessService,
        readAdapter,
        getAttachmentDownloadUrlUseCase,
      ),
    accessService,
    readAdapter,
    createDirectConversationUseCase,
    createCommunicationMessageUseCase,
    markCommunicationConversationReadUseCase,
    getMessageReadersUseCase,
    getMessageInfoUseCase,
    getAttachmentDownloadUrlUseCase,
  };
}

function createUseCasesWithValidAccess(): ReturnType<typeof createUseCases> {
  const created = createUseCases();
  created.accessService.getCurrentStudentWithEnrollment.mockResolvedValue(
    currentStudentFixture(),
  );
  return created;
}

function currentStudentFixture(): StudentAppCurrentStudentWithEnrollment {
  return {
    context: contextFixture(),
    student: {
      id: 'student-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      userId: 'student-user-1',
      status: StudentStatus.ACTIVE,
      deletedAt: null,
      user: {
        id: 'student-user-1',
        userType: UserType.STUDENT,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
    },
    enrollment: {
      id: 'enrollment-1',
      schoolId: 'school-1',
      studentId: 'student-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomId: 'classroom-1',
      status: StudentEnrollmentStatus.ACTIVE,
      deletedAt: null,
    },
  };
}

function contextFixture(): StudentAppContext {
  return {
    studentUserId: 'student-user-1',
    studentId: 'student-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: [],
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    requestedAcademicYearId: 'year-1',
    requestedTermId: 'term-1',
    termId: 'term-1',
  };
}

function conversationFixture() {
  return {
    id: 'conversation-1',
    participants: [],
    messages: [],
  };
}

function conversationDetailFixture() {
  const now = new Date('2026-01-01T08:00:00.000Z');
  return {
    id: 'conversation-1',
    type: CommunicationConversationType.DIRECT,
    status: CommunicationConversationStatus.ACTIVE,
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
        id: 'participant-student',
        conversationId: 'conversation-1',
        userId: 'student-user-1',
        role: 'OWNER',
        status: 'ACTIVE',
        lastReadMessageId: null,
        lastReadAt: null,
        createdAt: now,
        updatedAt: now,
        user: {
          id: 'student-user-1',
          firstName: 'Student',
          lastName: 'User',
          userType: UserType.STUDENT,
          status: UserStatus.ACTIVE,
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
          userType: UserType.TEACHER,
          status: UserStatus.ACTIVE,
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
    senderUserId: 'student-user-1',
    kind: CommunicationMessageKind.TEXT,
    status: CommunicationMessageStatus.SENT,
    body: 'Hello',
    replyToMessageId: null,
    editedAt: null,
    hiddenAt: null,
    deletedAt: null,
    reads: [],
    _count: { reads: 0 },
    attachments: [],
    sentAt: new Date('2026-01-01T08:00:00.000Z'),
    createdAt: new Date('2026-01-01T08:00:00.000Z'),
    updatedAt: new Date('2026-01-01T08:00:00.000Z'),
    senderUser: {
      id: 'student-user-1',
      firstName: 'Student',
      lastName: 'User',
      userType: UserType.STUDENT,
      status: UserStatus.ACTIVE,
    },
    ...(overrides ?? {}),
  };
}

function attachmentFixture() {
  return {
    id: 'attachment-1',
    fileId: 'file-1',
    caption: 'Homework PDF',
    sortOrder: 0,
    createdAt: new Date('2026-01-01T08:00:00.000Z'),
    file: {
      originalName: 'homework.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 123n,
      visibility: 'PRIVATE',
      createdAt: new Date('2026-01-01T08:00:00.000Z'),
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
