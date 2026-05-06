import { StudentEnrollmentStatus, StudentStatus, UserStatus, UserType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { StudentAppStudentReadAdapter } from '../student-app-student-read.adapter';

describe('StudentAppStudentReadAdapter', () => {
  it('finds linked students through scoped Prisma without hand-crafted schoolId', async () => {
    const { adapter, scopedStudentMocks, baseStudentMocks } = createAdapter();
    scopedStudentMocks.findFirst.mockResolvedValue(null);

    await adapter.findLinkedStudentByUserId('student-user-1');

    expect(scopedStudentMocks.findFirst).toHaveBeenCalledTimes(1);
    expect(baseStudentMocks.findFirst).not.toHaveBeenCalled();
    const query = scopedStudentMocks.findFirst.mock.calls[0][0];
    expect(query.where).toMatchObject({
      userId: 'student-user-1',
      status: StudentStatus.ACTIVE,
      deletedAt: null,
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
  });

  it('finds active enrollment through scoped Prisma and optional academic context filters', async () => {
    const { adapter, scopedEnrollmentMocks } = createAdapter();
    scopedEnrollmentMocks.findFirst.mockResolvedValue(null);

    await adapter.findActiveEnrollmentForStudent({
      studentId: 'student-1',
      studentUserId: 'student-user-1',
      academicYearId: 'year-1',
      termId: 'term-1',
    });

    const query = scopedEnrollmentMocks.findFirst.mock.calls[0][0];
    expect(query.where).toMatchObject({
      studentId: 'student-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      status: StudentEnrollmentStatus.ACTIVE,
      deletedAt: null,
      student: {
        is: {
          userId: 'student-user-1',
          status: StudentStatus.ACTIVE,
          user: {
            is: {
              userType: UserType.STUDENT,
              deletedAt: null,
            },
          },
        },
      },
    });
    expect(query.where).not.toHaveProperty('schoolId');
    expect(query.orderBy).toEqual([
      { enrolledAt: 'desc' },
      { createdAt: 'desc' },
    ]);
  });

  it('verifies student, enrollment, and classroom ownership with read-only scoped queries', async () => {
    const { adapter, scopedStudentMocks, scopedEnrollmentMocks } = createAdapter();
    scopedStudentMocks.findFirst.mockResolvedValue(null);
    scopedEnrollmentMocks.findFirst.mockResolvedValue(null);

    await adapter.findOwnedStudentById({
      studentId: 'student-1',
      studentUserId: 'student-user-1',
    });
    await adapter.findOwnedEnrollmentById({
      enrollmentId: 'enrollment-1',
      studentId: 'student-1',
      studentUserId: 'student-user-1',
    });
    await adapter.findOwnedClassroomEnrollment({
      classroomId: 'classroom-1',
      studentId: 'student-1',
      studentUserId: 'student-user-1',
    });

    expect(scopedStudentMocks.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'student-1',
      userId: 'student-user-1',
    });
    expect(
      scopedEnrollmentMocks.findFirst.mock.calls[0][0].where,
    ).toMatchObject({
      id: 'enrollment-1',
      studentId: 'student-1',
    });
    expect(
      scopedEnrollmentMocks.findFirst.mock.calls[1][0].where,
    ).toMatchObject({
      classroomId: 'classroom-1',
      studentId: 'student-1',
    });

    for (const query of [
      scopedStudentMocks.findFirst.mock.calls[0][0],
      scopedEnrollmentMocks.findFirst.mock.calls[0][0],
      scopedEnrollmentMocks.findFirst.mock.calls[1][0],
    ]) {
      expect(query.where).not.toHaveProperty('schoolId');
    }
  });

  it('does not perform mutations or platform bypass calls', async () => {
    const {
      adapter,
      scopedStudentMocks,
      scopedEnrollmentMocks,
      mutationMocks,
      platformBypass,
    } = createAdapter();
    scopedStudentMocks.findFirst.mockResolvedValue(null);
    scopedEnrollmentMocks.findFirst.mockResolvedValue(null);

    await adapter.findLinkedStudentByUserId('student-user-1');
    await adapter.findActiveEnrollmentForStudent({
      studentId: 'student-1',
      studentUserId: 'student-user-1',
    });
    await adapter.findOwnedStudentById({
      studentId: 'student-1',
      studentUserId: 'student-user-1',
    });
    await adapter.findOwnedEnrollmentById({
      enrollmentId: 'enrollment-1',
      studentId: 'student-1',
      studentUserId: 'student-user-1',
    });
    await adapter.findOwnedClassroomEnrollment({
      classroomId: 'classroom-1',
      studentId: 'student-1',
      studentUserId: 'student-user-1',
    });

    for (const mutation of Object.values(mutationMocks)) {
      expect(mutation).not.toHaveBeenCalled();
    }
    expect(platformBypass).not.toHaveBeenCalled();
  });
});

function createAdapter(): {
  adapter: StudentAppStudentReadAdapter;
  scopedStudentMocks: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
  scopedEnrollmentMocks: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
  baseStudentMocks: { findFirst: jest.Mock };
  mutationMocks: Record<string, jest.Mock>;
  platformBypass: jest.Mock;
} {
  const scopedStudentMocks = {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
  const scopedEnrollmentMocks = {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
  const baseStudentMocks = { findFirst: jest.fn() };
  const platformBypass = jest.fn();

  const prisma = {
    student: baseStudentMocks,
    platformBypass,
    scoped: {
      student: scopedStudentMocks,
      enrollment: scopedEnrollmentMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new StudentAppStudentReadAdapter(prisma),
    scopedStudentMocks,
    scopedEnrollmentMocks,
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
    },
    platformBypass,
  };
}
