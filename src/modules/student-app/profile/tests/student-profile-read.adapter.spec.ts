import { StudentStatus, UserStatus, UserType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';
import { StudentProfileReadAdapter } from '../infrastructure/student-profile-read.adapter';

describe('StudentProfileReadAdapter', () => {
  it('reads student profile through scoped Prisma without hand-crafted schoolId', async () => {
    const { adapter, scopedStudentMocks, baseStudentMocks } = createAdapter();
    scopedStudentMocks.findFirst.mockResolvedValue(null);

    await adapter.findStudentProfile(contextFixture());

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

  it('reads school display with a null logoUrl', async () => {
    const { adapter, scopedSchoolProfileMocks, scopedSchoolMocks } =
      createAdapter();
    scopedSchoolProfileMocks.findFirst.mockResolvedValue(null);
    scopedSchoolMocks.findFirst.mockResolvedValue({ name: 'Fallback School' });

    await expect(adapter.findSchoolDisplay(contextFixture())).resolves.toEqual({
      name: 'Fallback School',
      logoUrl: null,
    });
    expect(scopedSchoolProfileMocks.findFirst.mock.calls[0][0].select).toEqual({
      schoolName: true,
      shortName: true,
    });
    expect(scopedSchoolMocks.findFirst.mock.calls[0][0].where).toEqual({
      id: 'school-1',
      organizationId: 'org-1',
      deletedAt: null,
    });
  });

  it('derives total XP from XpLedger without touching behavior points', async () => {
    const { adapter, scopedXpLedgerMocks, scopedBehaviorPointLedgerMocks } =
      createAdapter();
    scopedXpLedgerMocks.aggregate.mockResolvedValue({ _sum: { amount: 42 } });

    await expect(
      adapter.sumTotalXpForCurrentStudent(contextFixture()),
    ).resolves.toBe(42);
    expect(scopedXpLedgerMocks.aggregate.mock.calls[0][0].where).toEqual({
      studentId: 'student-1',
    });
    expect(scopedBehaviorPointLedgerMocks.aggregate).not.toHaveBeenCalled();
  });

  it('performs no mutations or platform bypass calls', async () => {
    const {
      adapter,
      mutationMocks,
      platformBypass,
      scopedStudentMocks,
      scopedEnrollmentMocks,
      scopedSchoolProfileMocks,
      scopedXpLedgerMocks,
    } = createAdapter();
    scopedStudentMocks.findFirst.mockResolvedValue(null);
    scopedEnrollmentMocks.findFirst.mockResolvedValue(null);
    scopedSchoolProfileMocks.findFirst.mockResolvedValue(null);
    scopedXpLedgerMocks.aggregate.mockResolvedValue({ _sum: { amount: null } });

    await adapter.findStudentProfile(contextFixture());
    await adapter.findCurrentEnrollment(contextFixture());
    await adapter.findSchoolDisplay(contextFixture());
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
  aggregate: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
} {
  return {
    findFirst: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
}

function createAdapter(): {
  adapter: StudentProfileReadAdapter;
  scopedStudentMocks: ReturnType<typeof modelMocks>;
  scopedEnrollmentMocks: ReturnType<typeof modelMocks>;
  scopedSchoolProfileMocks: ReturnType<typeof modelMocks>;
  scopedSchoolMocks: ReturnType<typeof modelMocks>;
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
      xpLedger: scopedXpLedgerMocks,
      behaviorPointLedger: scopedBehaviorPointLedgerMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new StudentProfileReadAdapter(prisma),
    scopedStudentMocks,
    scopedEnrollmentMocks,
    scopedSchoolProfileMocks,
    scopedSchoolMocks,
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
      xpLedgerCreate: scopedXpLedgerMocks.create,
      behaviorLedgerAggregate: scopedBehaviorPointLedgerMocks.aggregate,
    },
    platformBypass,
  };
}
