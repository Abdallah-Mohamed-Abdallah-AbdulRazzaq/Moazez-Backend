import {
  MembershipStatus,
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import { TeacherProfileReadAdapter } from '../infrastructure/teacher-profile-read.adapter';

describe('TeacherProfileReadAdapter', () => {
  it('reads teacher identity and role through scoped Prisma without hand-crafted schoolId', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.user.findFirst.mockResolvedValue(null);
    prismaMocks.membership.findFirst.mockResolvedValue(null);

    await adapter.findTeacherIdentity('teacher-1');
    await adapter.findTeacherRole({
      teacherUserId: 'teacher-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      membershipId: 'membership-1',
      roleId: 'role-1',
      permissions: [],
    });

    expect(prismaMocks.user.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'teacher-1',
      userType: UserType.TEACHER,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    });
    expect(
      prismaMocks.membership.findFirst.mock.calls[0][0].where,
    ).toMatchObject({
      id: 'membership-1',
      userId: 'teacher-1',
      userType: UserType.TEACHER,
      status: MembershipStatus.ACTIVE,
      deletedAt: null,
    });
    expect(prismaMocks.user.findFirst.mock.calls[0][0].where).not.toHaveProperty(
      'schoolId',
    );
    expect(
      prismaMocks.membership.findFirst.mock.calls[0][0].where,
    ).not.toHaveProperty('schoolId');
  });

  it('uses school profile for display without selecting raw logo fields', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.schoolProfile.findFirst.mockResolvedValue({
      schoolName: 'Moazez Academy',
      shortName: 'MA',
    });

    await expect(
      adapter.findSchoolDisplay({
        teacherUserId: 'teacher-1',
        schoolId: 'school-1',
        organizationId: 'org-1',
        membershipId: 'membership-1',
        roleId: 'role-1',
        permissions: [],
      }),
    ).resolves.toEqual({ name: 'Moazez Academy', logoUrl: null });

    const selectJson = JSON.stringify(
      prismaMocks.schoolProfile.findFirst.mock.calls[0][0].select,
    );
    expect(selectJson).not.toContain('logoUrl');
  });

  it('counts distinct active students from owned allocation scopes only', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.enrollment.findMany.mockResolvedValue([
      { studentId: 'student-1' },
      { studentId: 'student-2' },
    ]);

    await expect(
      adapter.countDistinctStudentsForAllocations([allocationFixture()]),
    ).resolves.toBe(2);

    const query = prismaMocks.enrollment.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      OR: [
        expect.objectContaining({
          classroomId: 'classroom-1',
          academicYearId: 'year-1',
          termId: 'term-1',
          status: StudentEnrollmentStatus.ACTIVE,
          deletedAt: null,
          student: {
            is: {
              status: StudentStatus.ACTIVE,
              deletedAt: null,
            },
          },
        }),
      ],
    });
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('remains read-only', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.user.findFirst.mockResolvedValue(null);
    prismaMocks.membership.findFirst.mockResolvedValue(null);
    prismaMocks.schoolProfile.findFirst.mockResolvedValue(null);
    prismaMocks.school.findFirst.mockResolvedValue(null);
    prismaMocks.enrollment.findMany.mockResolvedValue([]);

    await adapter.findTeacherIdentity('teacher-1');
    await adapter.findTeacherRole({
      teacherUserId: 'teacher-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      membershipId: 'membership-1',
      roleId: 'role-1',
      permissions: [],
    });
    await adapter.findSchoolDisplay({
      teacherUserId: 'teacher-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      membershipId: 'membership-1',
      roleId: 'role-1',
      permissions: [],
    });
    await adapter.countDistinctStudentsForAllocations([allocationFixture()]);

    expect(prismaMocks.user.create).not.toHaveBeenCalled();
    expect(prismaMocks.user.update).not.toHaveBeenCalled();
    expect(prismaMocks.membership.update).not.toHaveBeenCalled();
    expect(prismaMocks.schoolProfile.update).not.toHaveBeenCalled();
    expect(prismaMocks.enrollment.update).not.toHaveBeenCalled();
  });
});

function createAdapter(): {
  adapter: TeacherProfileReadAdapter;
  prismaMocks: {
    user: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    membership: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    schoolProfile: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    school: { findFirst: jest.Mock };
    enrollment: {
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };
} {
  const prismaMocks = {
    user: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    membership: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    schoolProfile: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    school: { findFirst: jest.fn() },
    enrollment: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const prisma = {
    scoped: prismaMocks,
  } as unknown as PrismaService;

  return {
    adapter: new TeacherProfileReadAdapter(prisma),
    prismaMocks,
  };
}

function allocationFixture(): TeacherAppAllocationRecord {
  const schoolId = 'school-1';

  return {
    id: 'allocation-1',
    schoolId,
    teacherUserId: 'teacher-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    subject: {
      id: 'subject-1',
      schoolId,
      nameAr: 'Math AR',
      nameEn: 'Math',
      code: 'MATH',
    },
    classroom: {
      id: 'classroom-1',
      schoolId,
      sectionId: 'section-1',
      roomId: null,
      nameAr: 'Classroom AR',
      nameEn: 'Classroom',
      room: null,
      section: {
        id: 'section-1',
        schoolId,
        gradeId: 'grade-1',
        nameAr: 'Section AR',
        nameEn: 'Section',
        grade: {
          id: 'grade-1',
          schoolId,
          stageId: 'stage-1',
          nameAr: 'Grade AR',
          nameEn: 'Grade',
          stage: {
            id: 'stage-1',
            schoolId,
            nameAr: 'Stage AR',
            nameEn: 'Stage',
          },
        },
      },
    },
    term: {
      id: 'term-1',
      schoolId,
      academicYearId: 'year-1',
      nameAr: 'Term AR',
      nameEn: 'Term',
      isActive: true,
    },
  };
}
