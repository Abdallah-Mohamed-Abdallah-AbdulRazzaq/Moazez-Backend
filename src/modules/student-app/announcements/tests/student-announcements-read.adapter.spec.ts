import {
  CommunicationAnnouncementAudienceType,
  CommunicationAnnouncementStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';
import { StudentAnnouncementsReadAdapter } from '../infrastructure/student-announcements-read.adapter';

describe('StudentAnnouncementsReadAdapter', () => {
  it('lists published announcements matching the student audience hierarchy', async () => {
    const {
      adapter,
      enrollmentMocks,
      announcementMocks,
      announcementReadMocks,
    } = createAdapter();
    enrollmentMocks.findFirstOrThrow.mockResolvedValue(enrollmentFixture());
    announcementMocks.findMany.mockResolvedValue([]);
    announcementMocks.count.mockResolvedValue(0);
    announcementReadMocks.findMany.mockResolvedValue([]);

    await adapter.listAnnouncements({ context: contextFixture() });

    const query = announcementMocks.findMany.mock.calls[0][0];
    expect(query.where.status).toBe(CommunicationAnnouncementStatus.PUBLISHED);
    expect(query.where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          OR: expect.arrayContaining([
            { audienceType: CommunicationAnnouncementAudienceType.SCHOOL },
            expect.objectContaining({
              audienceType: CommunicationAnnouncementAudienceType.CLASSROOM,
            }),
            expect.objectContaining({
              audienceType: CommunicationAnnouncementAudienceType.CUSTOM,
            }),
          ]),
        }),
      ]),
    );
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('marks read with the current student user only after a visible announcement exists', async () => {
    const { adapter, enrollmentMocks, announcementMocks, announcementReadMocks } =
      createAdapter();
    enrollmentMocks.findFirstOrThrow.mockResolvedValue(enrollmentFixture());
    announcementMocks.findFirst.mockResolvedValue(announcementFixture());
    announcementReadMocks.findFirst.mockResolvedValue(null);
    announcementReadMocks.create.mockResolvedValue({});

    await adapter.markAnnouncementRead({
      context: contextFixture(),
      announcementId: 'announcement-1',
    });

    expect(announcementReadMocks.create.mock.calls[0][0].data).toMatchObject({
      schoolId: 'school-1',
      announcementId: 'announcement-1',
      userId: 'student-user-1',
    });
  });

  it('returns safe attachment metadata only for visible announcements', async () => {
    const {
      adapter,
      enrollmentMocks,
      announcementMocks,
      announcementReadMocks,
      attachmentMocks,
    } = createAdapter();
    enrollmentMocks.findFirstOrThrow.mockResolvedValue(enrollmentFixture());
    announcementMocks.findFirst.mockResolvedValue(announcementFixture());
    announcementReadMocks.findFirst.mockResolvedValue(null);
    attachmentMocks.findMany.mockResolvedValue([]);

    await adapter.listAttachments({
      context: contextFixture(),
      announcementId: 'announcement-1',
    });

    expect(attachmentMocks.findMany.mock.calls[0][0].where).toEqual({
      announcementId: 'announcement-1',
    });
  });
});

function modelMocks() {
  return {
    findFirst: jest.fn(),
    findFirstOrThrow: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

function createAdapter(): {
  adapter: StudentAnnouncementsReadAdapter;
  enrollmentMocks: ReturnType<typeof modelMocks>;
  announcementMocks: ReturnType<typeof modelMocks>;
  announcementReadMocks: ReturnType<typeof modelMocks>;
  attachmentMocks: ReturnType<typeof modelMocks>;
} {
  const enrollmentMocks = modelMocks();
  const announcementMocks = modelMocks();
  const announcementReadMocks = modelMocks();
  const attachmentMocks = modelMocks();
  const prisma = {
    scoped: {
      enrollment: enrollmentMocks,
      communicationAnnouncement: announcementMocks,
      communicationAnnouncementRead: announcementReadMocks,
      communicationAnnouncementAttachment: attachmentMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new StudentAnnouncementsReadAdapter(prisma),
    enrollmentMocks,
    announcementMocks,
    announcementReadMocks,
    attachmentMocks,
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

function enrollmentFixture() {
  return {
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
    status: CommunicationAnnouncementStatus.PUBLISHED,
    audienceType: CommunicationAnnouncementAudienceType.SCHOOL,
    createdAt: new Date('2026-01-01T08:00:00.000Z'),
    _count: { attachments: 0 },
  };
}
