import {
  CommunicationAnnouncementPriority,
  CommunicationAnnouncementStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { TeacherAppContext } from '../../shared/teacher-app-context';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import { TeacherAnnouncementsReadAdapter } from '../infrastructure/teacher-announcements-read.adapter';

describe('TeacherAnnouncementsReadAdapter', () => {
  it('lists teacher-app announcements through createdBy + metadata + allocation ownership without hand-crafted schoolId', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.communicationAnnouncement.findMany.mockResolvedValue([
      announcementRow(),
      announcementRow({
        id: 'foreign-target-announcement',
        metadata: teacherMetadata({
          classId: 'foreign-allocation',
          classroomId: 'foreign-classroom',
        }),
      }),
    ]);

    const result = await adapter.listTeacherAnnouncements({
      context: contextFixture(),
      allocations: [allocationFixture()],
      filters: { status: 'draft', search: 'quiz', limit: 10 },
    });

    const query = prismaMocks.communicationAnnouncement.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      createdById: 'teacher-user-1',
      status: CommunicationAnnouncementStatus.DRAFT,
      metadata: {
        path: ['teacherApp', 'source'],
        equals: 'teacher_app',
      },
    });
    expect(JSON.stringify(query.where)).toContain('quiz');
    expect(query.where).not.toHaveProperty('schoolId');
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('finds detail only when teacher metadata target still matches owned allocation', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.communicationAnnouncement.findFirst.mockResolvedValue(
      announcementRow({
        metadata: teacherMetadata({
          classId: 'foreign-allocation',
          classroomId: 'foreign-classroom',
        }),
      }),
    );

    const result = await adapter.findTeacherAnnouncement({
      context: contextFixture(),
      allocations: [allocationFixture()],
      announcementId: 'announcement-1',
    });

    const query =
      prismaMocks.communicationAnnouncement.findFirst.mock.calls[0][0];
    expect(query.where).toMatchObject({
      id: 'announcement-1',
      createdById: 'teacher-user-1',
    });
    expect(result).toBeNull();
  });

  it('resolves students_and_parents to student user rows and guardian rows only for active classroom enrollments', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.enrollment.findMany.mockResolvedValue([
      enrollmentRow(),
      enrollmentRow({
        student: {
          ...enrollmentRow().student,
          id: 'student-2',
          userId: 'student-user-2',
          user: {
            id: 'student-user-2',
            userType: UserType.STUDENT,
            status: UserStatus.SUSPENDED,
            deletedAt: null,
          },
          guardians: [],
        },
      }),
    ]);

    const rows = await adapter.resolveAudienceRowsForClassroom({
      classroomId: 'classroom-1',
      audience: 'students_and_parents',
    });

    const query = prismaMocks.enrollment.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      classroomId: 'classroom-1',
      status: StudentEnrollmentStatus.ACTIVE,
      deletedAt: null,
      student: {
        is: {
          status: StudentStatus.ACTIVE,
          deletedAt: null,
        },
      },
    });
    expect(rows).toEqual([
      { audienceType: 'custom', userId: 'student-user-1' },
      { audienceType: 'custom', guardianId: 'guardian-1' },
    ]);
  });

  it('deduplicates guardian recipients and rejects empty audiences', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.enrollment.findMany.mockResolvedValue([
      enrollmentRow(),
      enrollmentRow({ student: { ...enrollmentRow().student, id: 'student-2' } }),
    ]);

    await expect(
      adapter.resolveAudienceRowsForClassroom({
        classroomId: 'classroom-1',
        audience: 'parents',
      }),
    ).resolves.toEqual([{ audienceType: 'custom', guardianId: 'guardian-1' }]);

    prismaMocks.enrollment.findMany.mockResolvedValueOnce([]);

    await expect(
      adapter.resolveAudienceRowsForClassroom({
        classroomId: 'empty-classroom',
        audience: 'students',
      }),
    ).rejects.toMatchObject({ code: 'validation.failed' });
  });
});

function createAdapter(): {
  adapter: TeacherAnnouncementsReadAdapter;
  prismaMocks: {
    communicationAnnouncement: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    enrollment: {
      findMany: jest.Mock;
    };
  };
} {
  const prismaMocks = {
    communicationAnnouncement: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    enrollment: {
      findMany: jest.fn(),
    },
  };
  const prisma = {
    scoped: prismaMocks,
  } as unknown as PrismaService;

  return {
    adapter: new TeacherAnnouncementsReadAdapter(prisma),
    prismaMocks,
  };
}

function contextFixture(): TeacherAppContext {
  return {
    teacherUserId: 'teacher-user-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: [],
  };
}

function allocationFixture(): TeacherAppAllocationRecord {
  return {
    id: 'allocation-1',
    schoolId: 'school-1',
    teacherUserId: 'teacher-user-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    subject: null,
    classroom: {
      id: 'classroom-1',
      schoolId: 'school-1',
      sectionId: 'section-1',
      roomId: null,
      nameAr: 'Classroom AR',
      nameEn: 'Classroom',
      room: null,
      section: {
        id: 'section-1',
        schoolId: 'school-1',
        gradeId: 'grade-1',
        nameAr: 'Section AR',
        nameEn: 'Section',
        grade: {
          id: 'grade-1',
          schoolId: 'school-1',
          stageId: 'stage-1',
          nameAr: 'Grade AR',
          nameEn: 'Grade',
          stage: {
            id: 'stage-1',
            schoolId: 'school-1',
            nameAr: 'Stage AR',
            nameEn: 'Stage',
          },
        },
      },
    },
    term: null,
  };
}

function announcementRow(overrides?: Record<string, unknown>) {
  return {
    id: 'announcement-1',
    title: 'Quiz tomorrow',
    body: 'Please revise chapter 3.',
    status: CommunicationAnnouncementStatus.DRAFT,
    priority: CommunicationAnnouncementPriority.NORMAL,
    publishedAt: null,
    archivedAt: null,
    createdAt: new Date('2026-09-19T08:00:00.000Z'),
    updatedAt: new Date('2026-09-19T08:00:00.000Z'),
    metadata: teacherMetadata(),
    _count: {
      attachments: 0,
      reads: 0,
    },
    ...overrides,
  };
}

function teacherMetadata(overrides?: Record<string, unknown>) {
  return {
    teacherApp: {
      source: 'teacher_app',
      targetType: 'classroom',
      classId: 'allocation-1',
      classroomId: 'classroom-1',
      label: 'Grade / Section / Classroom',
      audience: 'students_and_parents',
      ...overrides,
    },
  };
}

function enrollmentRow(overrides?: Record<string, unknown>) {
  return {
    student: {
      id: 'student-1',
      userId: 'student-user-1',
      user: {
        id: 'student-user-1',
        userType: UserType.STUDENT,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
      guardians: [
        {
          guardian: {
            id: 'guardian-1',
            userId: 'parent-user-1',
            deletedAt: null,
            user: {
              id: 'parent-user-1',
              userType: UserType.PARENT,
              status: UserStatus.ACTIVE,
              deletedAt: null,
            },
          },
        },
      ],
    },
    ...overrides,
  };
}
