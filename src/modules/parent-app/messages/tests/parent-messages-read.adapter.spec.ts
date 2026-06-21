import {
  CommunicationMessageKind,
  CommunicationMessageStatus,
  CommunicationParticipantStatus,
} from '@prisma/client';
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

  it('searches only sent visible text inside the current parent conversation scope', async () => {
    const { adapter, messageMocks } = createAdapter();
    messageMocks.findMany.mockResolvedValue([]);
    messageMocks.count.mockResolvedValue(0);

    await adapter.searchMessages({
      conversationId: 'conversation-1',
      parentUserId: 'parent-user-1',
      q: 'invoice',
      page: 2,
      limit: 10,
    });

    const query = messageMocks.findMany.mock.calls[0][0];
    const selectJson = JSON.stringify(query.select);

    expect(query.where).toMatchObject({
      conversationId: 'conversation-1',
      status: CommunicationMessageStatus.SENT,
      kind: { not: CommunicationMessageKind.SYSTEM },
      hiddenAt: null,
      deletedAt: null,
      body: {
        contains: 'invoice',
        mode: 'insensitive',
      },
      conversation: {
        is: {
          deletedAt: null,
          participants: {
            some: {
              userId: 'parent-user-1',
              status: {
                in: [
                  CommunicationParticipantStatus.ACTIVE,
                  CommunicationParticipantStatus.MUTED,
                ],
              },
            },
          },
        },
      },
    });
    expect(query.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(query.take).toBe(10);
    expect(query.skip).toBe(10);
    expect(query.where).not.toHaveProperty('schoolId');
    expect(selectJson).toContain('attachments');
    expect(selectJson).not.toContain('bucket');
    expect(selectJson).not.toContain('objectKey');
    expect(selectJson).not.toContain('metadata');
    expect(messageMocks.count.mock.calls[0][0].where).toEqual(query.where);
  });

  it('discovers parent contacts only through linked child classroom allocations', async () => {
    const { adapter, conversationMocks, teacherAllocationMocks } =
      createAdapter();
    teacherAllocationMocks.findMany.mockResolvedValue([
      {
        teacherUserId: 'teacher-user-1',
        subject: { nameEn: 'Math', nameAr: null },
        classroom: { nameEn: 'Grade 4', nameAr: null },
        teacherUser: {
          id: 'teacher-user-1',
          firstName: 'Test',
          lastName: 'Teacher',
          userType: 'TEACHER',
          status: 'ACTIVE',
        },
      },
    ]);
    conversationMocks.findMany.mockResolvedValue([
      {
        id: 'conversation-1',
        participants: [
          { userId: 'parent-user-1' },
          { userId: 'teacher-user-1' },
        ],
      },
    ]);

    const result = await adapter.listContactsForParent({
      context: {
        parentUserId: 'parent-user-1',
        schoolId: 'school-1',
        organizationId: 'org-1',
        membershipId: 'membership-1',
        roleId: 'role-1',
        permissions: [],
        guardianIds: ['guardian-1'],
        children: [
          {
            studentId: 'student-1',
            enrollmentId: 'enrollment-1',
            classroomId: 'classroom-1',
            academicYearId: 'year-1',
            termId: 'term-1',
          },
        ],
      },
      filters: { q: 'test' },
    });

    const query = teacherAllocationMocks.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      classroomId: { in: ['classroom-1'] },
      teacherUserId: { not: 'parent-user-1' },
      teacherUser: {
        is: expect.objectContaining({
          userType: 'TEACHER',
          status: 'ACTIVE',
          deletedAt: null,
        }),
      },
    });
    expect(JSON.stringify(query.where)).toContain('test');
    expect(result.items).toEqual([
      expect.objectContaining({
        contactId: 'teacher:teacher-user-1',
        targetUserId: 'teacher-user-1',
        displayName: 'Test Teacher',
        conversationId: 'conversation-1',
      }),
    ]);
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
  teacherAllocationMocks: ReturnType<typeof modelMocks>;
  mutationMocks: Record<string, jest.Mock>;
  platformBypass: jest.Mock;
} {
  const conversationMocks = modelMocks();
  const messageMocks = modelMocks();
  const participantMocks = modelMocks();
  const attachmentMocks = modelMocks();
  const teacherAllocationMocks = modelMocks();
  const platformBypass = jest.fn();
  const prisma = {
    platformBypass,
    scoped: {
      communicationConversation: conversationMocks,
      communicationMessage: messageMocks,
      communicationConversationParticipant: participantMocks,
      communicationMessageAttachment: attachmentMocks,
      teacherSubjectAllocation: teacherAllocationMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new ParentMessagesReadAdapter(prisma),
    conversationMocks,
    messageMocks,
    teacherAllocationMocks,
    mutationMocks: {
      conversationCreate: conversationMocks.create,
      participantCreate: participantMocks.create,
      attachmentCreate: attachmentMocks.create,
      messageAttachmentCreate: attachmentMocks.create,
    },
    platformBypass,
  };
}
