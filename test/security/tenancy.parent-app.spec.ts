import {
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import { ParentAppAccessService } from '../../src/modules/parent-app/access/parent-app-access.service';
import { ParentAppGuardianReadAdapter } from '../../src/modules/parent-app/access/parent-app-guardian-read.adapter';
import type {
  ParentAppEnrollmentRecord,
  ParentAppGuardianRecord,
  ParentAppStudentGuardianLinkRecord,
} from '../../src/modules/parent-app/shared/parent-app.types';

const PARENT_USER_ID = 'parent-user-1';
const GUARDIAN_ID = 'guardian-1';
const STUDENT_ID = 'student-1';
const SECOND_STUDENT_ID = 'student-2';
const ENROLLMENT_ID = 'enrollment-1';
const SECOND_ENROLLMENT_ID = 'enrollment-2';
const CLASSROOM_ID = 'classroom-1';
const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';

describe('Parent App ownership foundation (security)', () => {
  it('does not allow a parent to access an unlinked same-school child', async () => {
    const { service, adapter } = createValidService();
    adapter.findOwnedActiveEnrollmentForStudent.mockResolvedValue(null);

    await expect(
      withParentRequestContext(() =>
        service.assertParentOwnsStudent('same-school-unlinked-student'),
      ),
    ).rejects.toMatchObject({
      code: 'parent_app.child.not_found',
    });
    expect(adapter.findOwnedActiveEnrollmentForStudent).toHaveBeenCalledWith({
      studentId: 'same-school-unlinked-student',
      guardianIds: [GUARDIAN_ID],
    });
  });

  it('does not allow a parent to access a cross-school guessed child', async () => {
    const { service, adapter } = createValidService();
    adapter.findOwnedActiveEnrollmentForStudent.mockResolvedValue(null);

    await expect(
      withParentRequestContext(() =>
        service.assertParentOwnsStudent('cross-school-student'),
      ),
    ).rejects.toMatchObject({
      code: 'parent_app.child.not_found',
    });
  });

  it('returns only current-school linked children from the active school context', async () => {
    const { service, adapter } = createValidService();

    const children = await withParentRequestContext(() =>
      service.listAccessibleChildren(),
    );

    expect(children).toEqual([
      {
        studentId: STUDENT_ID,
        enrollmentId: ENROLLMENT_ID,
        classroomId: CLASSROOM_ID,
        academicYearId: 'year-1',
        termId: 'term-1',
      },
      {
        studentId: SECOND_STUDENT_ID,
        enrollmentId: SECOND_ENROLLMENT_ID,
        classroomId: CLASSROOM_ID,
        academicYearId: 'year-1',
        termId: 'term-1',
      },
    ]);
    expect(children.map((child) => child.studentId)).not.toContain(
      'cross-school-student',
    );
    expect(adapter.listActiveEnrollmentsForLinkedStudents).toHaveBeenCalledWith(
      {
        guardianIds: [GUARDIAN_ID],
        studentIds: [STUDENT_ID, SECOND_STUDENT_ID],
      },
    );
  });

  it('rejects non-parent actors before resolving guardian ownership', async () => {
    const { service, adapter } = createValidService();

    await expect(
      withParentRequestContext(() => service.getParentAppContext(), {
        userType: UserType.TEACHER,
      }),
    ).rejects.toMatchObject({
      code: 'parent_app.actor.required_parent',
    });
    expect(adapter.listCurrentSchoolGuardiansByUserId).not.toHaveBeenCalled();
  });
});

async function withParentRequestContext<T>(
  fn: () => T | Promise<T>,
  options?: { userType?: UserType },
): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({
      id: PARENT_USER_ID,
      userType: options?.userType ?? UserType.PARENT,
    });
    setActiveMembership({
      membershipId: 'membership-1',
      organizationId: ORGANIZATION_ID,
      schoolId: SCHOOL_ID,
      roleId: 'role-1',
      permissions: ['students.records.view'],
    });

    return fn();
  });
}

function createValidService(): {
  service: ParentAppAccessService;
  adapter: jest.Mocked<ParentAppGuardianReadAdapter>;
} {
  const adapter = {
    listCurrentSchoolGuardiansByUserId: jest
      .fn()
      .mockResolvedValue([guardianFixture()]),
    listLinkedStudentsForGuardians: jest.fn().mockResolvedValue([
      linkFixture(),
      linkFixture({
        id: 'link-2',
        studentId: SECOND_STUDENT_ID,
        student: studentRecordFixture({ id: SECOND_STUDENT_ID }),
      }),
    ]),
    listActiveEnrollmentsForLinkedStudents: jest.fn().mockResolvedValue([
      enrollmentFixture(),
      enrollmentFixture({
        id: SECOND_ENROLLMENT_ID,
        studentId: SECOND_STUDENT_ID,
        student: studentRecordFixture({ id: SECOND_STUDENT_ID }),
      }),
    ]),
    findOwnedActiveEnrollmentForStudent: jest.fn(),
    findOwnedEnrollmentById: jest.fn(),
    findOwnedClassroomEnrollment: jest.fn(),
  } as unknown as jest.Mocked<ParentAppGuardianReadAdapter>;

  return {
    service: new ParentAppAccessService(adapter),
    adapter,
  };
}

function guardianFixture(
  overrides?: Partial<ParentAppGuardianRecord>,
): ParentAppGuardianRecord {
  return {
    id: GUARDIAN_ID,
    schoolId: SCHOOL_ID,
    organizationId: ORGANIZATION_ID,
    userId: PARENT_USER_ID,
    deletedAt: null,
    user: {
      id: PARENT_USER_ID,
      userType: UserType.PARENT,
      status: UserStatus.ACTIVE,
      deletedAt: null,
    },
    ...overrides,
  };
}

function studentRecordFixture(overrides?: {
  id?: string;
  schoolId?: string;
  organizationId?: string;
  status?: StudentStatus;
  deletedAt?: Date | null;
}): NonNullable<ParentAppStudentGuardianLinkRecord['student']> {
  return {
    id: overrides?.id ?? STUDENT_ID,
    schoolId: overrides?.schoolId ?? SCHOOL_ID,
    organizationId: overrides?.organizationId ?? ORGANIZATION_ID,
    status: overrides?.status ?? StudentStatus.ACTIVE,
    deletedAt: overrides?.deletedAt ?? null,
  };
}

function linkFixture(
  overrides?: Partial<ParentAppStudentGuardianLinkRecord>,
): ParentAppStudentGuardianLinkRecord {
  return {
    id: 'link-1',
    schoolId: SCHOOL_ID,
    studentId: STUDENT_ID,
    guardianId: GUARDIAN_ID,
    student: studentRecordFixture(),
    ...overrides,
  };
}

function enrollmentFixture(
  overrides?: Partial<ParentAppEnrollmentRecord>,
): ParentAppEnrollmentRecord {
  return {
    id: ENROLLMENT_ID,
    schoolId: SCHOOL_ID,
    studentId: STUDENT_ID,
    academicYearId: 'year-1',
    termId: 'term-1',
    classroomId: CLASSROOM_ID,
    status: StudentEnrollmentStatus.ACTIVE,
    deletedAt: null,
    student: studentRecordFixture(),
    ...overrides,
  };
}
