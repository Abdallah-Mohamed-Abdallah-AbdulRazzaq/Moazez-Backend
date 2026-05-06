import { ReinforcementTaskStatus, StudentStatus, UserStatus, UserType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';
import { StudentHomeReadAdapter } from '../infrastructure/student-home-read.adapter';

describe('StudentHomeReadAdapter', () => {
  it('reads student identity through scoped Prisma without hand-crafted schoolId', async () => {
    const { adapter, scopedStudentMocks, baseStudentMocks } = createAdapter();
    scopedStudentMocks.findFirst.mockResolvedValue(null);

    await adapter.findStudentIdentity(contextFixture());

    const query = scopedStudentMocks.findFirst.mock.calls[0][0];
    expect(query.where).toMatchObject({
      id: 'student-1',
      userId: 'student-user-1',
      status: StudentStatus.ACTIVE,
      user: {
        is: {
          id: 'student-user-1',
          userType: UserType.STUDENT,
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
      },
    });
    expect(query.where).not.toHaveProperty('schoolId');
    expect(baseStudentMocks.findFirst).not.toHaveBeenCalled();
  });

  it('reads enrollment hierarchy through scoped Prisma', async () => {
    const { adapter, scopedEnrollmentMocks } = createAdapter();
    scopedEnrollmentMocks.findFirst.mockResolvedValue(null);

    await adapter.findCurrentEnrollment(contextFixture());

    const query = scopedEnrollmentMocks.findFirst.mock.calls[0][0];
    expect(query.where).toEqual({
      id: 'enrollment-1',
      studentId: 'student-1',
      academicYearId: 'year-1',
    });
    expect(query.where).not.toHaveProperty('schoolId');
    expect(query.select.classroom.select.section.select.grade.select.stage).toBeDefined();
  });

  it('derives subject and pending task counts only from owned scoped data', async () => {
    const {
      adapter,
      scopedTeacherSubjectAllocationMocks,
      scopedReinforcementAssignmentMocks,
    } = createAdapter();
    scopedTeacherSubjectAllocationMocks.findMany.mockResolvedValue([
      { subjectId: 'subject-1' },
      { subjectId: 'subject-2' },
    ]);
    scopedReinforcementAssignmentMocks.count.mockResolvedValue(2);

    await expect(
      adapter.countSubjectsForCurrentClassroom(contextFixture()),
    ).resolves.toBe(2);
    await expect(
      adapter.countPendingTasksForCurrentStudent(contextFixture()),
    ).resolves.toBe(2);

    const subjectsQuery =
      scopedTeacherSubjectAllocationMocks.findMany.mock.calls[0][0];
    expect(subjectsQuery.where).toMatchObject({
      classroomId: 'classroom-1',
      termId: 'term-1',
    });
    expect(subjectsQuery.where).not.toHaveProperty('schoolId');
    expect(subjectsQuery.distinct).toEqual(['subjectId']);

    const tasksQuery = scopedReinforcementAssignmentMocks.count.mock.calls[0][0];
    expect(tasksQuery.where).toMatchObject({
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      status: {
        in: [
          ReinforcementTaskStatus.NOT_COMPLETED,
          ReinforcementTaskStatus.IN_PROGRESS,
          ReinforcementTaskStatus.UNDER_REVIEW,
        ],
      },
    });
    expect(tasksQuery.where).not.toHaveProperty('schoolId');
  });

  it('returns zero subjects when the active enrollment has no term', async () => {
    const { adapter, scopedTeacherSubjectAllocationMocks } = createAdapter();

    await expect(
      adapter.countSubjectsForCurrentClassroom({
        ...contextFixture(),
        termId: null,
      }),
    ).resolves.toBe(0);
    expect(scopedTeacherSubjectAllocationMocks.findMany).not.toHaveBeenCalled();
  });

  it('derives total XP from XpLedger without touching behavior points', async () => {
    const { adapter, scopedXpLedgerMocks, scopedBehaviorPointLedgerMocks } =
      createAdapter();
    scopedXpLedgerMocks.aggregate.mockResolvedValue({ _sum: { amount: 15 } });

    await expect(
      adapter.sumTotalXpForCurrentStudent(contextFixture()),
    ).resolves.toBe(15);

    expect(scopedXpLedgerMocks.aggregate.mock.calls[0][0].where).toEqual({
      studentId: 'student-1',
    });
    expect(scopedBehaviorPointLedgerMocks.aggregate).not.toHaveBeenCalled();
  });

  it('reads school display without exposing logo storage data', async () => {
    const { adapter, scopedSchoolProfileMocks, scopedSchoolMocks } =
      createAdapter();
    scopedSchoolProfileMocks.findFirst.mockResolvedValue({
      schoolName: 'Profile School',
      shortName: 'PS',
    });

    await expect(adapter.findSchoolDisplay(contextFixture())).resolves.toEqual({
      name: 'Profile School',
      logoUrl: null,
    });
    expect(scopedSchoolMocks.findFirst).not.toHaveBeenCalled();
  });

  it('performs no mutations or platform bypass calls', async () => {
    const {
      adapter,
      mutationMocks,
      platformBypass,
      scopedStudentMocks,
      scopedEnrollmentMocks,
      scopedSchoolProfileMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedReinforcementAssignmentMocks,
      scopedXpLedgerMocks,
    } = createAdapter();
    scopedStudentMocks.findFirst.mockResolvedValue(null);
    scopedEnrollmentMocks.findFirst.mockResolvedValue(null);
    scopedSchoolProfileMocks.findFirst.mockResolvedValue(null);
    scopedTeacherSubjectAllocationMocks.findMany.mockResolvedValue([]);
    scopedReinforcementAssignmentMocks.count.mockResolvedValue(0);
    scopedXpLedgerMocks.aggregate.mockResolvedValue({ _sum: { amount: null } });

    await adapter.findStudentIdentity(contextFixture());
    await adapter.findCurrentEnrollment(contextFixture());
    await adapter.findSchoolDisplay(contextFixture());
    await adapter.countSubjectsForCurrentClassroom(contextFixture());
    await adapter.countPendingTasksForCurrentStudent(contextFixture());
    await adapter.sumTotalXpForCurrentStudent(contextFixture());

    for (const mutation of Object.values(mutationMocks)) {
      expect(mutation).not.toHaveBeenCalled();
    }
    expect(platformBypass).not.toHaveBeenCalled();
  });
});

function contextFixture(): StudentAppContext {
  return {
    studentUserId: 'student-user-1',
    studentId: 'student-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: ['students.records.view'],
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    requestedAcademicYearId: 'year-1',
    requestedTermId: 'term-1',
    termId: 'term-1',
  };
}

function modelMocks(): {
  findFirst: jest.Mock;
  findMany: jest.Mock;
  count: jest.Mock;
  aggregate: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
} {
  return {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
}

function createAdapter(): {
  adapter: StudentHomeReadAdapter;
  scopedStudentMocks: ReturnType<typeof modelMocks>;
  scopedEnrollmentMocks: ReturnType<typeof modelMocks>;
  scopedSchoolProfileMocks: ReturnType<typeof modelMocks>;
  scopedSchoolMocks: ReturnType<typeof modelMocks>;
  scopedTeacherSubjectAllocationMocks: ReturnType<typeof modelMocks>;
  scopedReinforcementAssignmentMocks: ReturnType<typeof modelMocks>;
  scopedXpLedgerMocks: ReturnType<typeof modelMocks>;
  scopedBehaviorPointLedgerMocks: ReturnType<typeof modelMocks>;
  baseStudentMocks: { findFirst: jest.Mock };
  mutationMocks: Record<string, jest.Mock>;
  platformBypass: jest.Mock;
} {
  const scopedStudentMocks = modelMocks();
  const scopedEnrollmentMocks = modelMocks();
  const scopedSchoolProfileMocks = modelMocks();
  const scopedSchoolMocks = modelMocks();
  const scopedTeacherSubjectAllocationMocks = modelMocks();
  const scopedReinforcementAssignmentMocks = modelMocks();
  const scopedXpLedgerMocks = modelMocks();
  const scopedBehaviorPointLedgerMocks = modelMocks();
  const baseStudentMocks = { findFirst: jest.fn() };
  const platformBypass = jest.fn();

  const prisma = {
    student: baseStudentMocks,
    platformBypass,
    scoped: {
      student: scopedStudentMocks,
      enrollment: scopedEnrollmentMocks,
      schoolProfile: scopedSchoolProfileMocks,
      school: scopedSchoolMocks,
      teacherSubjectAllocation: scopedTeacherSubjectAllocationMocks,
      reinforcementAssignment: scopedReinforcementAssignmentMocks,
      xpLedger: scopedXpLedgerMocks,
      behaviorPointLedger: scopedBehaviorPointLedgerMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new StudentHomeReadAdapter(prisma),
    scopedStudentMocks,
    scopedEnrollmentMocks,
    scopedSchoolProfileMocks,
    scopedSchoolMocks,
    scopedTeacherSubjectAllocationMocks,
    scopedReinforcementAssignmentMocks,
    scopedXpLedgerMocks,
    scopedBehaviorPointLedgerMocks,
    baseStudentMocks,
    mutationMocks: {
      studentCreate: scopedStudentMocks.create,
      studentUpdate: scopedStudentMocks.update,
      studentUpdateMany: scopedStudentMocks.updateMany,
      studentDelete: scopedStudentMocks.delete,
      studentDeleteMany: scopedStudentMocks.deleteMany,
      enrollmentCreate: scopedEnrollmentMocks.create,
      enrollmentUpdate: scopedEnrollmentMocks.update,
      enrollmentUpdateMany: scopedEnrollmentMocks.updateMany,
      enrollmentDelete: scopedEnrollmentMocks.delete,
      enrollmentDeleteMany: scopedEnrollmentMocks.deleteMany,
      assignmentCreate: scopedReinforcementAssignmentMocks.create,
      assignmentUpdate: scopedReinforcementAssignmentMocks.update,
      xpLedgerCreate: scopedXpLedgerMocks.create,
      behaviorLedgerAggregate: scopedBehaviorPointLedgerMocks.aggregate,
    },
    platformBypass,
  };
}
