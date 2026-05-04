import { UserStatus, UserType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { TeacherAppCompositionReadAdapter } from '../infrastructure/teacher-app-composition-read.adapter';

describe('TeacherAppCompositionReadAdapter', () => {
  it('reads current teacher identity through scoped Prisma without schoolId filtering', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.user.findFirst.mockResolvedValue({
      id: 'teacher-1',
      email: 'teacher@moazez.local',
      firstName: 'Test',
      lastName: 'Teacher',
      userType: UserType.TEACHER,
      status: UserStatus.ACTIVE,
    });

    await adapter.findTeacherIdentity('teacher-1');

    const query = prismaMocks.user.findFirst.mock.calls[0][0];
    expect(query.where).toMatchObject({
      id: 'teacher-1',
      userType: UserType.TEACHER,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    });
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('counts active students and pending teacher tasks without mutations', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.enrollment.findMany.mockResolvedValue([
      { studentId: 'student-1' },
      { studentId: 'student-2' },
    ]);
    prismaMocks.reinforcementAssignment.count.mockResolvedValue(5);

    await expect(
      adapter.countActiveStudentsAcrossClassrooms([
        'classroom-1',
        'classroom-1',
        'classroom-2',
      ]),
    ).resolves.toBe(2);
    await expect(
      adapter.countPendingTeacherTaskAssignments({
        teacherUserId: 'teacher-1',
        classroomIds: ['classroom-1'],
      }),
    ).resolves.toBe(5);

    expect(prismaMocks.enrollment.findMany).toHaveBeenCalledTimes(1);
    expect(
      prismaMocks.enrollment.findMany.mock.calls[0][0].where,
    ).not.toHaveProperty('schoolId');
    expect(prismaMocks.reinforcementAssignment.count).toHaveBeenCalledTimes(1);
    expect(prismaMocks.create).not.toHaveBeenCalled();
    expect(prismaMocks.update).not.toHaveBeenCalled();
    expect(prismaMocks.delete).not.toHaveBeenCalled();
  });

  it('builds class metrics from active enrollments and assignment submissions', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.enrollment.groupBy.mockResolvedValue([
      { classroomId: 'classroom-1', _count: { _all: 24 } },
    ]);
    prismaMocks.gradeAssessment.findMany.mockResolvedValue([
      {
        id: 'assessment-1',
        classroomId: 'classroom-1',
        subjectId: 'subject-1',
        termId: 'term-1',
        _count: { submissions: 3 },
      },
    ]);

    const metrics = await adapter.buildClassMetrics([
      {
        id: 'allocation-1',
        schoolId: 'school-1',
        teacherUserId: 'teacher-1',
        classroomId: 'classroom-1',
        subjectId: 'subject-1',
        termId: 'term-1',
        classroom: null,
        subject: null,
        term: null,
      },
    ]);

    expect(metrics.get('allocation-1')).toMatchObject({
      studentsCount: 24,
      activeAssignmentsCount: 1,
      pendingReviewCount: 3,
      followUpCount: null,
      pendingAttendanceCount: null,
      averageGrade: null,
      completionRate: null,
    });
  });
});

function createAdapter(): {
  adapter: TeacherAppCompositionReadAdapter;
  prismaMocks: {
    user: { findFirst: jest.Mock };
    schoolProfile: { findFirst: jest.Mock };
    school: { findFirst: jest.Mock };
    enrollment: {
      findMany: jest.Mock;
      groupBy: jest.Mock;
    };
    reinforcementAssignment: { count: jest.Mock };
    gradeAssessment: { findMany: jest.Mock };
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
} {
  const prismaMocks = {
    user: { findFirst: jest.fn() },
    schoolProfile: { findFirst: jest.fn() },
    school: { findFirst: jest.fn() },
    enrollment: {
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    reinforcementAssignment: { count: jest.fn() },
    gradeAssessment: { findMany: jest.fn() },
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const prisma = {
    scoped: prismaMocks,
  } as unknown as PrismaService;

  return {
    adapter: new TeacherAppCompositionReadAdapter(prisma),
    prismaMocks,
  };
}
