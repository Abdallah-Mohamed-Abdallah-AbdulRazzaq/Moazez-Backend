import {
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
import { CreateCommunicationMessageUseCase } from '../../../communication/application/communication-message.use-cases';
import { MarkCommunicationConversationReadUseCase } from '../../../communication/application/communication-message.use-cases';
import { ListStudentMessageConversationsUseCase } from '../application/list-student-message-conversations.use-case';
import { ListStudentConversationMessagesUseCase } from '../application/list-student-conversation-messages.use-case';
import { SendStudentConversationMessageUseCase } from '../application/send-student-conversation-message.use-case';
import { MarkStudentConversationReadUseCase } from '../application/mark-student-conversation-read.use-case';
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

  it('delegates text-only sends to Communication core after visibility passes', async () => {
    const {
      sendUseCase,
      readAdapter,
      createCommunicationMessageUseCase,
    } = createUseCasesWithValidAccess();
    readAdapter.findConversationForStudent.mockResolvedValue(
      conversationFixture() as any,
    );
    createCommunicationMessageUseCase.execute.mockResolvedValue({
      id: 'message-1',
    });
    readAdapter.findMessageForStudent.mockResolvedValue(messageFixture() as any);

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
    });

    await readUseCase.execute('conversation-1');

    expect(markCommunicationConversationReadUseCase.execute).toHaveBeenCalledWith(
      'conversation-1',
    );
  });
});

function createUseCases(): {
  listUseCase: ListStudentMessageConversationsUseCase;
  messagesUseCase: ListStudentConversationMessagesUseCase;
  sendUseCase: SendStudentConversationMessageUseCase;
  readUseCase: MarkStudentConversationReadUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  readAdapter: jest.Mocked<StudentMessagesReadAdapter>;
  createCommunicationMessageUseCase: jest.Mocked<CreateCommunicationMessageUseCase>;
  markCommunicationConversationReadUseCase: jest.Mocked<MarkCommunicationConversationReadUseCase>;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest.fn(),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const readAdapter = {
    listConversations: jest.fn(),
    getUnreadSummary: jest.fn(),
    findConversationForStudent: jest.fn(),
    listMessages: jest.fn(),
    findMessageForStudent: jest.fn(),
  } as unknown as jest.Mocked<StudentMessagesReadAdapter>;
  const createCommunicationMessageUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<CreateCommunicationMessageUseCase>;
  const markCommunicationConversationReadUseCase = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<MarkCommunicationConversationReadUseCase>;

  return {
    listUseCase: new ListStudentMessageConversationsUseCase(
      accessService,
      readAdapter,
    ),
    messagesUseCase: new ListStudentConversationMessagesUseCase(
      accessService,
      readAdapter,
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
    accessService,
    readAdapter,
    createCommunicationMessageUseCase,
    markCommunicationConversationReadUseCase,
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

function messageFixture() {
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
  };
}
