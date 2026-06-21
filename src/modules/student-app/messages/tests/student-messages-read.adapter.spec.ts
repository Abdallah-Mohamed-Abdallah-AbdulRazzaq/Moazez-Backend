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
    conversationMocks.findMany.mockResolvedValue([{ id: 'conversation-1' }]);
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
    const selectJson = JSON.stringify(query.select);
    const attachmentFileSelectJson = JSON.stringify(
      query.select.messages.select.attachments.select.file.select,
    );
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

  it('discovers student contacts only through current classroom teacher allocations', async () => {
    const { adapter, conversationMocks, teacherAllocationMocks } =
      createAdapter();
    teacherAllocationMocks.findMany.mockResolvedValue([
      {
        teacherUserId: 'teacher-user-1',
        subject: { nameEn: 'Science', nameAr: null },
        classroom: { nameEn: 'Grade 5', nameAr: null },
        teacherUser: {
          id: 'teacher-user-1',
          firstName: 'Sara',
          lastName: 'Teacher',
          userType: 'TEACHER',
          status: 'ACTIVE',
        },
      },
    ]);
    conversationMocks.findMany.mockResolvedValue([]);

    const result = await adapter.listContactsForStudent({
      context: {
        studentUserId: 'student-user-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        classroomId: 'classroom-1',
        academicYearId: 'year-1',
        termId: 'term-1',
        schoolId: 'school-1',
        organizationId: 'org-1',
        membershipId: 'membership-1',
        roleId: 'role-1',
        permissions: [],
      },
      filters: { q: 'sara' },
    });

    const query = teacherAllocationMocks.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      classroomId: 'classroom-1',
      teacherUserId: { not: 'student-user-1' },
      teacherUser: {
        is: expect.objectContaining({
          userType: 'TEACHER',
          status: 'ACTIVE',
          deletedAt: null,
        }),
      },
    });
    expect(JSON.stringify(query.where)).toContain('sara');
    expect(result.items).toEqual([
      expect.objectContaining({
        contactId: 'teacher:teacher-user-1',
        targetUserId: 'teacher-user-1',
        displayName: 'Sara Teacher',
        conversationId: null,
      }),
    ]);
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
  teacherAllocationMocks: ReturnType<typeof modelMocks>;
  platformBypass: jest.Mock;
} {
  const conversationMocks = modelMocks();
  const messageMocks = modelMocks();
  const teacherAllocationMocks = modelMocks();
  const platformBypass = jest.fn();
  const prisma = {
    platformBypass,
    scoped: {
      communicationConversation: conversationMocks,
      communicationMessage: messageMocks,
      teacherSubjectAllocation: teacherAllocationMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new StudentMessagesReadAdapter(prisma),
    conversationMocks,
    messageMocks,
    teacherAllocationMocks,
    platformBypass,
  };
}
