import {
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { ParentAppGuardianReadAdapter } from '../parent-app-guardian-read.adapter';

describe('ParentAppGuardianReadAdapter', () => {
  it('finds current-school guardians through scoped Prisma without hand-crafted schoolId', async () => {
    const { adapter, scopedGuardianMocks, baseGuardianMocks } = createAdapter();
    scopedGuardianMocks.findMany.mockResolvedValue([]);

    await adapter.listCurrentSchoolGuardiansByUserId('parent-user-1');

    expect(scopedGuardianMocks.findMany).toHaveBeenCalledTimes(1);
    expect(baseGuardianMocks.findMany).not.toHaveBeenCalled();
    const query = scopedGuardianMocks.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      userId: 'parent-user-1',
      deletedAt: null,
      user: {
        is: {
          id: 'parent-user-1',
          userType: UserType.PARENT,
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
      },
    });
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('finds linked students and active enrollments through scoped Prisma', async () => {
    const { adapter, scopedStudentGuardianMocks, scopedEnrollmentMocks } =
      createAdapter();
    scopedStudentGuardianMocks.findMany.mockResolvedValue([]);
    scopedEnrollmentMocks.findMany.mockResolvedValue([]);

    await adapter.listLinkedStudentsForGuardians(['guardian-1', 'guardian-2']);
    await adapter.listActiveEnrollmentsForLinkedStudents({
      guardianIds: ['guardian-1'],
      studentIds: ['student-1', 'student-2'],
    });

    const linkQuery = scopedStudentGuardianMocks.findMany.mock.calls[0][0];
    expect(linkQuery.where).toMatchObject({
      guardianId: { in: ['guardian-1', 'guardian-2'] },
      guardian: {
        is: {
          id: { in: ['guardian-1', 'guardian-2'] },
          deletedAt: null,
        },
      },
      student: {
        is: {
          status: StudentStatus.ACTIVE,
          deletedAt: null,
        },
      },
    });
    expect(linkQuery.where).not.toHaveProperty('schoolId');

    const enrollmentQuery = scopedEnrollmentMocks.findMany.mock.calls[0][0];
    expect(enrollmentQuery.where).toMatchObject({
      studentId: { in: ['student-1', 'student-2'] },
      status: StudentEnrollmentStatus.ACTIVE,
      deletedAt: null,
      student: {
        is: {
          status: StudentStatus.ACTIVE,
          guardians: {
            some: {
              guardianId: { in: ['guardian-1'] },
            },
          },
        },
      },
    });
    expect(enrollmentQuery.where).not.toHaveProperty('schoolId');
    expect(enrollmentQuery.orderBy).toEqual([
      { enrolledAt: 'desc' },
      { createdAt: 'desc' },
    ]);
  });

  it('verifies student, enrollment, and classroom ownership with read-only scoped queries', async () => {
    const { adapter, scopedEnrollmentMocks } = createAdapter();
    scopedEnrollmentMocks.findFirst.mockResolvedValue(null);

    await adapter.findOwnedActiveEnrollmentForStudent({
      studentId: 'student-1',
      guardianIds: ['guardian-1'],
    });
    await adapter.findOwnedEnrollmentById({
      enrollmentId: 'enrollment-1',
      guardianIds: ['guardian-1'],
    });
    await adapter.findOwnedClassroomEnrollment({
      classroomId: 'classroom-1',
      guardianIds: ['guardian-1'],
    });

    expect(
      scopedEnrollmentMocks.findFirst.mock.calls[0][0].where,
    ).toMatchObject({
      studentId: 'student-1',
      status: StudentEnrollmentStatus.ACTIVE,
    });
    expect(
      scopedEnrollmentMocks.findFirst.mock.calls[1][0].where,
    ).toMatchObject({
      id: 'enrollment-1',
      status: StudentEnrollmentStatus.ACTIVE,
    });
    expect(
      scopedEnrollmentMocks.findFirst.mock.calls[2][0].where,
    ).toMatchObject({
      classroomId: 'classroom-1',
      status: StudentEnrollmentStatus.ACTIVE,
    });

    for (const query of scopedEnrollmentMocks.findFirst.mock.calls.map(
      (call) => call[0],
    )) {
      expect(query.where).not.toHaveProperty('schoolId');
    }
  });

  it('does not perform mutations or platform bypass calls', async () => {
    const {
      adapter,
      scopedGuardianMocks,
      scopedStudentGuardianMocks,
      scopedEnrollmentMocks,
      mutationMocks,
      platformBypass,
    } = createAdapter();
    scopedGuardianMocks.findMany.mockResolvedValue([]);
    scopedStudentGuardianMocks.findMany.mockResolvedValue([]);
    scopedEnrollmentMocks.findMany.mockResolvedValue([]);
    scopedEnrollmentMocks.findFirst.mockResolvedValue(null);

    await adapter.listCurrentSchoolGuardiansByUserId('parent-user-1');
    await adapter.listLinkedStudentsForGuardians(['guardian-1']);
    await adapter.listActiveEnrollmentsForLinkedStudents({
      guardianIds: ['guardian-1'],
      studentIds: ['student-1'],
    });
    await adapter.findOwnedActiveEnrollmentForStudent({
      studentId: 'student-1',
      guardianIds: ['guardian-1'],
    });
    await adapter.findOwnedEnrollmentById({
      enrollmentId: 'enrollment-1',
      guardianIds: ['guardian-1'],
    });
    await adapter.findOwnedClassroomEnrollment({
      classroomId: 'classroom-1',
      guardianIds: ['guardian-1'],
    });

    for (const mutation of Object.values(mutationMocks)) {
      expect(mutation).not.toHaveBeenCalled();
    }
    expect(platformBypass).not.toHaveBeenCalled();
  });
});

function createAdapter(): {
  adapter: ParentAppGuardianReadAdapter;
  scopedGuardianMocks: Record<string, jest.Mock>;
  scopedStudentGuardianMocks: Record<string, jest.Mock>;
  scopedEnrollmentMocks: Record<string, jest.Mock>;
  baseGuardianMocks: { findMany: jest.Mock };
  mutationMocks: Record<string, jest.Mock>;
  platformBypass: jest.Mock;
} {
  const scopedGuardianMocks = {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
  const scopedStudentGuardianMocks = {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
  const scopedEnrollmentMocks = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
  const baseGuardianMocks = { findMany: jest.fn() };
  const platformBypass = jest.fn();

  const prisma = {
    guardian: baseGuardianMocks,
    platformBypass,
    scoped: {
      guardian: scopedGuardianMocks,
      studentGuardian: scopedStudentGuardianMocks,
      enrollment: scopedEnrollmentMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new ParentAppGuardianReadAdapter(prisma),
    scopedGuardianMocks,
    scopedStudentGuardianMocks,
    scopedEnrollmentMocks,
    baseGuardianMocks,
    mutationMocks: {
      guardianCreate: scopedGuardianMocks.create,
      guardianUpdate: scopedGuardianMocks.update,
      guardianUpdateMany: scopedGuardianMocks.updateMany,
      guardianDelete: scopedGuardianMocks.delete,
      guardianDeleteMany: scopedGuardianMocks.deleteMany,
      studentGuardianCreate: scopedStudentGuardianMocks.create,
      studentGuardianUpdate: scopedStudentGuardianMocks.update,
      studentGuardianUpdateMany: scopedStudentGuardianMocks.updateMany,
      studentGuardianDelete: scopedStudentGuardianMocks.delete,
      studentGuardianDeleteMany: scopedStudentGuardianMocks.deleteMany,
      enrollmentCreate: scopedEnrollmentMocks.create,
      enrollmentUpdate: scopedEnrollmentMocks.update,
      enrollmentUpdateMany: scopedEnrollmentMocks.updateMany,
      enrollmentDelete: scopedEnrollmentMocks.delete,
      enrollmentDeleteMany: scopedEnrollmentMocks.deleteMany,
    },
    platformBypass,
  };
}
