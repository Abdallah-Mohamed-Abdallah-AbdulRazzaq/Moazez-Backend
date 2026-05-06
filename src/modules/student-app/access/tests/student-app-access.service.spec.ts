import {
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setAcademicContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import {
  StudentAppEnrollmentNotFoundException,
  StudentAppRequiredStudentException,
  StudentAppStudentNotFoundException,
} from '../../shared/student-app-errors';
import type {
  StudentAppEnrollmentRecord,
  StudentAppStudentRecord,
} from '../../shared/student-app.types';
import { StudentAppAccessService } from '../student-app-access.service';
import { StudentAppStudentReadAdapter } from '../student-app-student-read.adapter';

const STUDENT_USER_ID = 'student-user-1';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';
const CLASSROOM_ID = 'classroom-1';
const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';

describe('StudentAppAccessService', () => {
  it('rejects a missing actor', async () => {
    const { service } = createService();

    await expect(
      withRequestContext({ actor: null }, () => service.getStudentAppContext()),
    ).rejects.toBeInstanceOf(StudentAppRequiredStudentException);
  });

  it('rejects a non-student actor', async () => {
    const { service } = createService();

    await expect(
      withRequestContext(
        { actorUserType: UserType.PARENT },
        () => service.getStudentAppContext(),
      ),
    ).rejects.toBeInstanceOf(StudentAppRequiredStudentException);
  });

  it('rejects missing active membership or school context', async () => {
    const { service } = createService();

    await expect(
      withRequestContext({ activeMembership: null }, () =>
        service.getStudentAppContext(),
      ),
    ).rejects.toBeInstanceOf(StudentAppRequiredStudentException);

    await expect(
      withRequestContext(
        {
          activeMembership: {
            membershipId: 'membership-1',
            organizationId: ORGANIZATION_ID,
            schoolId: null,
            roleId: 'role-1',
            permissions: [],
          },
        },
        () => service.getStudentAppContext(),
      ),
    ).rejects.toBeInstanceOf(StudentAppRequiredStudentException);
  });

  it('rejects a student actor with no linked Student profile', async () => {
    const { service, adapter } = createService();
    adapter.findLinkedStudentByUserId.mockResolvedValue(null);

    await expect(
      withRequestContext({}, () => service.getStudentAppContext()),
    ).rejects.toBeInstanceOf(StudentAppStudentNotFoundException);
    expect(adapter.findLinkedStudentByUserId).toHaveBeenCalledWith(
      STUDENT_USER_ID,
    );
  });

  it('rejects a linked student with no active enrollment', async () => {
    const { service, adapter } = createService();
    adapter.findLinkedStudentByUserId.mockResolvedValue(studentFixture());
    adapter.findActiveEnrollmentForStudent.mockResolvedValue(null);

    await expect(
      withRequestContext({}, () => service.getStudentAppContext()),
    ).rejects.toBeInstanceOf(StudentAppEnrollmentNotFoundException);
    expect(adapter.findActiveEnrollmentForStudent).toHaveBeenCalledWith({
      studentId: STUDENT_ID,
      studentUserId: STUDENT_USER_ID,
      academicYearId: 'year-1',
      termId: 'term-1',
    });
  });

  it('returns compact Student App context for a valid student', async () => {
    const { service, adapter } = createService();
    adapter.findLinkedStudentByUserId.mockResolvedValue(studentFixture());
    adapter.findActiveEnrollmentForStudent.mockResolvedValue(enrollmentFixture());

    const result = await withRequestContext({}, () =>
      service.getStudentAppContext(),
    );

    expect(result).toEqual({
      studentUserId: STUDENT_USER_ID,
      studentId: STUDENT_ID,
      schoolId: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
      membershipId: 'membership-1',
      roleId: 'role-1',
      requestedAcademicYearId: 'year-1',
      requestedTermId: 'term-1',
      enrollmentId: ENROLLMENT_ID,
      classroomId: CLASSROOM_ID,
      academicYearId: 'year-1',
      termId: 'term-1',
      permissions: ['students.records.view', 'grades.assessments.view'],
    });
  });

  it('returns the current student with enrollment and current student id', async () => {
    const { service, adapter } = createService();
    adapter.findLinkedStudentByUserId.mockResolvedValue(studentFixture());
    adapter.findActiveEnrollmentForStudent.mockResolvedValue(enrollmentFixture());

    const result = await withRequestContext({}, () =>
      service.getCurrentStudentWithEnrollment(),
    );
    const studentId = await withRequestContext({}, () =>
      service.getCurrentStudentId(),
    );

    expect(result.student.id).toBe(STUDENT_ID);
    expect(result.enrollment.id).toBe(ENROLLMENT_ID);
    expect(studentId).toBe(STUDENT_ID);
  });

  it('assertStudentOwnsStudent accepts the current student', async () => {
    const { service, adapter } = createServiceWithValidContext();
    adapter.findOwnedStudentById.mockResolvedValue(studentFixture());

    const result = await withRequestContext({}, () =>
      service.assertStudentOwnsStudent(STUDENT_ID),
    );

    expect(result.id).toBe(STUDENT_ID);
    expect(adapter.findOwnedStudentById).toHaveBeenCalledWith({
      studentId: STUDENT_ID,
      studentUserId: STUDENT_USER_ID,
    });
  });

  it('assertStudentOwnsStudent rejects same-school other student as safe 404', async () => {
    const { service, adapter } = createServiceWithValidContext();
    adapter.findOwnedStudentById.mockResolvedValue(null);

    await expect(
      withRequestContext({}, () =>
        service.assertStudentOwnsStudent('same-school-other-student'),
      ),
    ).rejects.toMatchObject({
      code: 'student_app.student.not_found',
    });
  });

  it('assertStudentOwnsStudent rejects cross-school student as safe 404', async () => {
    const { service, adapter } = createServiceWithValidContext();
    adapter.findOwnedStudentById.mockResolvedValue(null);

    await expect(
      withRequestContext({}, () =>
        service.assertStudentOwnsStudent('cross-school-student'),
      ),
    ).rejects.toBeInstanceOf(StudentAppStudentNotFoundException);
  });

  it('assertStudentOwnsEnrollment and assertStudentOwnsClassroom accept current ownership', async () => {
    const { service, adapter } = createServiceWithValidContext();
    adapter.findOwnedEnrollmentById.mockResolvedValue(enrollmentFixture());
    adapter.findOwnedClassroomEnrollment.mockResolvedValue(enrollmentFixture());

    await expect(
      withRequestContext({}, () =>
        service.assertStudentOwnsEnrollment(ENROLLMENT_ID),
      ),
    ).resolves.toMatchObject({ id: ENROLLMENT_ID });
    await expect(
      withRequestContext({}, () =>
        service.assertStudentOwnsClassroom(CLASSROOM_ID),
      ),
    ).resolves.toMatchObject({ classroomId: CLASSROOM_ID });
  });

  it('assertStudentOwnsEnrollment and assertStudentOwnsClassroom reject guessed ids as safe 404', async () => {
    const { service, adapter } = createServiceWithValidContext();
    adapter.findOwnedEnrollmentById.mockResolvedValue(null);
    adapter.findOwnedClassroomEnrollment.mockResolvedValue(null);

    await expect(
      withRequestContext({}, () =>
        service.assertStudentOwnsEnrollment('cross-school-enrollment'),
      ),
    ).rejects.toMatchObject({
      code: 'student_app.enrollment.not_found',
    });
    await expect(
      withRequestContext({}, () =>
        service.assertStudentOwnsClassroom('cross-school-classroom'),
      ),
    ).rejects.toMatchObject({
      code: 'student_app.classroom.not_found',
    });
  });

  it('performs no mutations or platform bypass behavior', async () => {
    const mutationMocks = {
      createStudent: jest.fn(),
      updateStudent: jest.fn(),
      deleteStudent: jest.fn(),
      platformBypass: jest.fn(),
    };
    const { service, adapter } = createService(mutationMocks);
    adapter.findLinkedStudentByUserId.mockResolvedValue(studentFixture());
    adapter.findActiveEnrollmentForStudent.mockResolvedValue(enrollmentFixture());
    adapter.findOwnedStudentById.mockResolvedValue(studentFixture());

    await withRequestContext({}, () => service.assertCurrentStudent());
    await withRequestContext({}, () =>
      service.assertStudentOwnsStudent(STUDENT_ID),
    );

    expect(mutationMocks.createStudent).not.toHaveBeenCalled();
    expect(mutationMocks.updateStudent).not.toHaveBeenCalled();
    expect(mutationMocks.deleteStudent).not.toHaveBeenCalled();
    expect(mutationMocks.platformBypass).not.toHaveBeenCalled();
  });
});

type RequestContextOptions = {
  actor?: { id: string; userType: UserType } | null;
  actorUserType?: UserType;
  activeMembership?:
    | {
        membershipId: string;
        organizationId: string;
        schoolId: string | null;
        roleId: string;
        permissions: string[];
      }
    | null;
};

async function withRequestContext<T>(
  options: RequestContextOptions,
  fn: () => T | Promise<T>,
): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    if (options.actor !== null) {
      setActor(
        options.actor ?? {
          id: STUDENT_USER_ID,
          userType: options.actorUserType ?? UserType.STUDENT,
        },
      );
    }

    if (options.activeMembership !== null) {
      setActiveMembership(
        options.activeMembership ?? {
          membershipId: 'membership-1',
          organizationId: ORGANIZATION_ID,
          schoolId: SCHOOL_ID,
          roleId: 'role-1',
          permissions: ['students.records.view', 'grades.assessments.view'],
        },
      );
    }

    setAcademicContext({ academicYearId: 'year-1', termId: 'term-1' });

    return fn();
  });
}

function createService(
  extraAdapterMethods?: Record<string, jest.Mock>,
): {
  service: StudentAppAccessService;
  adapter: jest.Mocked<StudentAppStudentReadAdapter>;
} {
  const adapter = {
    findLinkedStudentByUserId: jest.fn(),
    findActiveEnrollmentForStudent: jest.fn(),
    findOwnedStudentById: jest.fn(),
    findOwnedEnrollmentById: jest.fn(),
    findOwnedClassroomEnrollment: jest.fn(),
    ...extraAdapterMethods,
  } as unknown as jest.Mocked<StudentAppStudentReadAdapter>;

  return {
    service: new StudentAppAccessService(adapter),
    adapter,
  };
}

function createServiceWithValidContext(): {
  service: StudentAppAccessService;
  adapter: jest.Mocked<StudentAppStudentReadAdapter>;
} {
  const created = createService();
  created.adapter.findLinkedStudentByUserId.mockResolvedValue(studentFixture());
  created.adapter.findActiveEnrollmentForStudent.mockResolvedValue(
    enrollmentFixture(),
  );

  return created;
}

function studentFixture(
  overrides?: Partial<StudentAppStudentRecord>,
): StudentAppStudentRecord {
  return {
    id: STUDENT_ID,
    schoolId: SCHOOL_ID,
    organizationId: ORGANIZATION_ID,
    userId: STUDENT_USER_ID,
    status: StudentStatus.ACTIVE,
    deletedAt: null,
    user: {
      id: STUDENT_USER_ID,
      userType: UserType.STUDENT,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
    ...overrides,
  };
}

function enrollmentFixture(
  overrides?: Partial<StudentAppEnrollmentRecord>,
): StudentAppEnrollmentRecord {
  return {
    id: ENROLLMENT_ID,
    schoolId: SCHOOL_ID,
    studentId: STUDENT_ID,
    academicYearId: 'year-1',
    termId: 'term-1',
    classroomId: CLASSROOM_ID,
    status: StudentEnrollmentStatus.ACTIVE,
    deletedAt: null,
    ...overrides,
  };
}
