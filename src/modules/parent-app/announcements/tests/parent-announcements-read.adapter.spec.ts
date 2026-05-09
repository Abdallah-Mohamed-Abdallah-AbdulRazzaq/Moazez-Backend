import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ParentAppContext } from '../../shared/parent-app.types';
import { ParentAnnouncementsReadAdapter } from '../infrastructure/parent-announcements-read.adapter';

describe('ParentAnnouncementsReadAdapter', () => {
  it('uses scoped Prisma and audience-safe filters for parent announcement reads', async () => {
    const { adapter, announcementMocks, enrollmentMocks, readMocks } =
      createAdapter();
    enrollmentMocks.findMany.mockResolvedValue([hierarchyFixture()]);
    announcementMocks.findMany.mockResolvedValue([]);
    announcementMocks.count.mockResolvedValue(0);
    readMocks.findMany.mockResolvedValue([]);

    await adapter.listAnnouncements({
      context: contextFixture(),
      query: { category: 'general' },
    });

    expect(enrollmentMocks.findMany.mock.calls[0][0].where).toMatchObject({
      id: { in: ['enrollment-1'] },
      studentId: { in: ['student-1'] },
    });
    expect(announcementMocks.findMany.mock.calls[0][0].where).toMatchObject({
      status: 'PUBLISHED',
    });
    expect(
      JSON.stringify(announcementMocks.findMany.mock.calls[0][0].where),
    ).toContain('parent-user-1');
    expect(
      announcementMocks.findMany.mock.calls[0][0].where,
    ).not.toHaveProperty('schoolId');
  });

  it('writes only announcement read markers after visible announcement validation', async () => {
    const {
      adapter,
      announcementMocks,
      enrollmentMocks,
      readMocks,
      mutationMocks,
      platformBypass,
    } = createAdapter();
    enrollmentMocks.findMany.mockResolvedValue([hierarchyFixture()]);
    announcementMocks.findFirst.mockResolvedValue(announcementFixture());
    readMocks.findFirst.mockResolvedValue(null);
    readMocks.create.mockResolvedValue(undefined);

    await adapter.markAnnouncementRead({
      context: contextFixture(),
      announcementId: 'announcement-1',
    });

    expect(readMocks.create).toHaveBeenCalledWith({
      data: {
        schoolId: 'school-1',
        announcementId: 'announcement-1',
        userId: 'parent-user-1',
        readAt: expect.any(Date),
      },
    });
    expect(mutationMocks.announcementCreate).not.toHaveBeenCalled();
    expect(mutationMocks.attachmentCreate).not.toHaveBeenCalled();
    expect(platformBypass).not.toHaveBeenCalled();
  });
});

function contextFixture(): ParentAppContext {
  return {
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
  };
}

function hierarchyFixture() {
  return {
    studentId: 'student-1',
    classroom: {
      id: 'classroom-1',
      section: {
        id: 'section-1',
        grade: {
          id: 'grade-1',
          stageId: 'stage-1',
        },
      },
    },
  };
}

function announcementFixture() {
  return {
    id: 'announcement-1',
    title: 'Announcement',
    body: 'Body',
    status: 'PUBLISHED',
    priority: 'NORMAL',
    audienceType: 'SCHOOL',
    category: null,
    isPinned: false,
    pinnedUntil: null,
    actionLabel: null,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    imageFile: null,
    createdBy: null,
    publishedBy: null,
    _count: { attachments: 0 },
  };
}

function modelMocks() {
  return {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
}

function createAdapter(): {
  adapter: ParentAnnouncementsReadAdapter;
  announcementMocks: ReturnType<typeof modelMocks>;
  attachmentMocks: ReturnType<typeof modelMocks>;
  enrollmentMocks: ReturnType<typeof modelMocks>;
  readMocks: ReturnType<typeof modelMocks>;
  mutationMocks: Record<string, jest.Mock>;
  platformBypass: jest.Mock;
} {
  const announcementMocks = modelMocks();
  const attachmentMocks = modelMocks();
  const enrollmentMocks = modelMocks();
  const readMocks = modelMocks();
  const platformBypass = jest.fn();
  const prisma = {
    platformBypass,
    scoped: {
      communicationAnnouncement: announcementMocks,
      communicationAnnouncementAttachment: attachmentMocks,
      communicationAnnouncementRead: readMocks,
      enrollment: enrollmentMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new ParentAnnouncementsReadAdapter(prisma),
    announcementMocks,
    attachmentMocks,
    enrollmentMocks,
    readMocks,
    mutationMocks: {
      announcementCreate: announcementMocks.create,
      announcementUpdate: announcementMocks.update,
      attachmentCreate: attachmentMocks.create,
      attachmentUpdate: attachmentMocks.update,
    },
    platformBypass,
  };
}
