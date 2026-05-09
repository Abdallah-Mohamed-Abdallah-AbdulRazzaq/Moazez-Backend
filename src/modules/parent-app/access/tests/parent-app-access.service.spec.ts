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
} from '../../../../common/context/request-context';
import {
  ParentAppChildNotFoundException,
  ParentAppClassroomNotFoundException,
  ParentAppEnrollmentNotFoundException,
  ParentAppGuardianNotFoundException,
  ParentAppRequiredParentException,
} from '../../shared/parent-app-errors';
import type {
  ParentAppEnrollmentRecord,
  ParentAppGuardianRecord,
  ParentAppStudentGuardianLinkRecord,
} from '../../shared/parent-app.types';
import { ParentAppAccessService } from '../parent-app-access.service';
import { ParentAppGuardianReadAdapter } from '../parent-app-guardian-read.adapter';

const PARENT_USER_ID = 'parent-user-1';
const GUARDIAN_ID = 'guardian-1';
const SECOND_GUARDIAN_ID = 'guardian-2';
const STUDENT_ID = 'student-1';
const SECOND_STUDENT_ID = 'student-2';
const ENROLLMENT_ID = 'enrollment-1';
const SECOND_ENROLLMENT_ID = 'enrollment-2';
const CLASSROOM_ID = 'classroom-1';
const SECOND_CLASSROOM_ID = 'classroom-2';
const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';

describe('ParentAppAccessService', () => {
  it('rejects a missing actor', async () => {
    const { service } = createService();

    await expect(
      withRequestContext({ actor: null }, () => service.getParentAppContext()),
    ).rejects.toBeInstanceOf(ParentAppRequiredParentException);
  });

  it('rejects a non-parent actor', async () => {
    const { service } = createService();

    await expect(
      withRequestContext({ actorUserType: UserType.TEACHER }, () =>
        service.getParentAppContext(),
      ),
    ).rejects.toBeInstanceOf(ParentAppRequiredParentException);
  });

  it('rejects missing active membership or school context', async () => {
    const { service } = createService();

    await expect(
      withRequestContext({ activeMembership: null }, () =>
        service.getParentAppContext(),
      ),
    ).rejects.toBeInstanceOf(ParentAppRequiredParentException);

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
        () => service.getParentAppContext(),
      ),
    ).rejects.toBeInstanceOf(ParentAppRequiredParentException);
  });

  it('rejects a parent actor with no linked Guardian in the current school', async () => {
    const { service, adapter } = createService();
    adapter.listCurrentSchoolGuardiansByUserId.mockResolvedValue([]);

    await expect(
      withRequestContext({}, () => service.getParentAppContext()),
    ).rejects.toBeInstanceOf(ParentAppGuardianNotFoundException);
    expect(adapter.listCurrentSchoolGuardiansByUserId).toHaveBeenCalledWith(
      PARENT_USER_ID,
    );
  });

  it('rejects a linked Guardian with no linked children', async () => {
    const { service, adapter } = createService();
    adapter.listCurrentSchoolGuardiansByUserId.mockResolvedValue([
      guardianFixture(),
    ]);
    adapter.listLinkedStudentsForGuardians.mockResolvedValue([]);

    await expect(
      withRequestContext({}, () => service.getParentAppContext()),
    ).rejects.toBeInstanceOf(ParentAppChildNotFoundException);
  });

  it('rejects a linked Guardian with no active current-school child enrollment', async () => {
    const { service, adapter } = createService();
    adapter.listCurrentSchoolGuardiansByUserId.mockResolvedValue([
      guardianFixture(),
    ]);
    adapter.listLinkedStudentsForGuardians.mockResolvedValue([linkFixture()]);
    adapter.listActiveEnrollmentsForLinkedStudents.mockResolvedValue([]);

    await expect(
      withRequestContext({}, () => service.getParentAppContext()),
    ).rejects.toBeInstanceOf(ParentAppEnrollmentNotFoundException);
    expect(adapter.listActiveEnrollmentsForLinkedStudents).toHaveBeenCalledWith(
      {
        guardianIds: [GUARDIAN_ID],
        studentIds: [STUDENT_ID],
      },
    );
  });

  it('returns compact Parent App context for a valid parent', async () => {
    const { service, adapter } = createServiceWithValidContext();

    const result = await withRequestContext({}, () =>
      service.getParentAppContext(),
    );

    expect(result).toEqual({
      parentUserId: PARENT_USER_ID,
      schoolId: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
      membershipId: 'membership-1',
      roleId: 'role-1',
      guardianIds: [GUARDIAN_ID],
      children: [
        {
          studentId: STUDENT_ID,
          enrollmentId: ENROLLMENT_ID,
          classroomId: CLASSROOM_ID,
          academicYearId: 'year-1',
          termId: 'term-1',
        },
      ],
      permissions: ['students.records.view', 'grades.assessments.view'],
    });
    expect(adapter.listLinkedStudentsForGuardians).toHaveBeenCalledWith([
      GUARDIAN_ID,
    ]);
  });

  it('returns multiple linked children in the same school', async () => {
    const { service, adapter } = createService();
    adapter.listCurrentSchoolGuardiansByUserId.mockResolvedValue([
      guardianFixture(),
      guardianFixture({ id: SECOND_GUARDIAN_ID }),
    ]);
    adapter.listLinkedStudentsForGuardians.mockResolvedValue([
      linkFixture(),
      linkFixture({
        id: 'link-2',
        guardianId: SECOND_GUARDIAN_ID,
        studentId: SECOND_STUDENT_ID,
        student: studentRecordFixture({ id: SECOND_STUDENT_ID }),
      }),
    ]);
    adapter.listActiveEnrollmentsForLinkedStudents.mockResolvedValue([
      enrollmentFixture(),
      enrollmentFixture({
        id: SECOND_ENROLLMENT_ID,
        studentId: SECOND_STUDENT_ID,
        classroomId: SECOND_CLASSROOM_ID,
        student: studentRecordFixture({ id: SECOND_STUDENT_ID }),
      }),
    ]);

    const children = await withRequestContext({}, () =>
      service.listAccessibleChildren(),
    );

    expect(children).toHaveLength(2);
    expect(children.map((child) => child.studentId)).toEqual([
      STUDENT_ID,
      SECOND_STUDENT_ID,
    ]);
  });

  it('lists accessible student and enrollment ids', async () => {
    const { service, adapter } = createService();
    adapter.listCurrentSchoolGuardiansByUserId.mockResolvedValue([
      guardianFixture(),
    ]);
    adapter.listLinkedStudentsForGuardians.mockResolvedValue([
      linkFixture(),
      linkFixture({
        id: 'link-2',
        studentId: SECOND_STUDENT_ID,
        student: studentRecordFixture({ id: SECOND_STUDENT_ID }),
      }),
    ]);
    adapter.listActiveEnrollmentsForLinkedStudents.mockResolvedValue([
      enrollmentFixture(),
      enrollmentFixture({
        id: SECOND_ENROLLMENT_ID,
        studentId: SECOND_STUDENT_ID,
        classroomId: SECOND_CLASSROOM_ID,
        student: studentRecordFixture({ id: SECOND_STUDENT_ID }),
      }),
    ]);

    await expect(
      withRequestContext({}, () => service.listAccessibleStudentIds()),
    ).resolves.toEqual([STUDENT_ID, SECOND_STUDENT_ID]);
    await expect(
      withRequestContext({}, () => service.listAccessibleEnrollmentIds()),
    ).resolves.toEqual([ENROLLMENT_ID, SECOND_ENROLLMENT_ID]);
  });

  it('rejects same-school unlinked and cross-school child ids as safe 404', async () => {
    const { service, adapter } = createServiceWithValidContext();
    adapter.findOwnedActiveEnrollmentForStudent.mockResolvedValue(null);

    await expect(
      withRequestContext({}, () =>
        service.assertParentOwnsStudent('same-school-unlinked-student'),
      ),
    ).rejects.toMatchObject({
      code: 'parent_app.child.not_found',
    });
    await expect(
      withRequestContext({}, () =>
        service.assertParentOwnsStudent('cross-school-student'),
      ),
    ).rejects.toBeInstanceOf(ParentAppChildNotFoundException);
  });

  it('assertParentOwnsEnrollment accepts owned enrollment and rejects same-school unlinked enrollment', async () => {
    const { service, adapter } = createServiceWithValidContext();
    adapter.findOwnedEnrollmentById.mockResolvedValue(enrollmentFixture());

    await expect(
      withRequestContext({}, () =>
        service.assertParentOwnsEnrollment(ENROLLMENT_ID),
      ),
    ).resolves.toMatchObject({ enrollmentId: ENROLLMENT_ID });

    adapter.findOwnedEnrollmentById.mockResolvedValue(null);
    await expect(
      withRequestContext({}, () =>
        service.assertParentOwnsEnrollment('same-school-unlinked-enrollment'),
      ),
    ).rejects.toMatchObject({
      code: 'parent_app.enrollment.not_found',
    });
  });

  it('assertParentOwnsClassroom accepts owned classroom and rejects unrelated classroom', async () => {
    const { service, adapter } = createServiceWithValidContext();
    adapter.findOwnedClassroomEnrollment.mockResolvedValue(enrollmentFixture());

    await expect(
      withRequestContext({}, () =>
        service.assertParentOwnsClassroom(CLASSROOM_ID),
      ),
    ).resolves.toMatchObject({ classroomId: CLASSROOM_ID });

    adapter.findOwnedClassroomEnrollment.mockResolvedValue(null);
    await expect(
      withRequestContext({}, () =>
        service.assertParentOwnsClassroom('unrelated-classroom'),
      ),
    ).rejects.toBeInstanceOf(ParentAppClassroomNotFoundException);
  });

  it('does not perform mutations or platform bypass behavior', async () => {
    const mutationMocks = {
      createGuardian: jest.fn(),
      updateGuardian: jest.fn(),
      deleteGuardian: jest.fn(),
      platformBypass: jest.fn(),
    };
    const { service, adapter } = createService(mutationMocks);
    adapter.listCurrentSchoolGuardiansByUserId.mockResolvedValue([
      guardianFixture(),
    ]);
    adapter.listLinkedStudentsForGuardians.mockResolvedValue([linkFixture()]);
    adapter.listActiveEnrollmentsForLinkedStudents.mockResolvedValue([
      enrollmentFixture(),
    ]);
    adapter.findOwnedActiveEnrollmentForStudent.mockResolvedValue(
      enrollmentFixture(),
    );

    await withRequestContext({}, () => service.assertCurrentParent());
    await withRequestContext({}, () =>
      service.assertParentOwnsStudent(STUDENT_ID),
    );

    expect(mutationMocks.createGuardian).not.toHaveBeenCalled();
    expect(mutationMocks.updateGuardian).not.toHaveBeenCalled();
    expect(mutationMocks.deleteGuardian).not.toHaveBeenCalled();
    expect(mutationMocks.platformBypass).not.toHaveBeenCalled();
  });
});

type RequestContextOptions = {
  actor?: { id: string; userType: UserType } | null;
  actorUserType?: UserType;
  activeMembership?: {
    membershipId: string;
    organizationId: string;
    schoolId: string | null;
    roleId: string;
    permissions: string[];
  } | null;
};

async function withRequestContext<T>(
  options: RequestContextOptions,
  fn: () => T | Promise<T>,
): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    if (options.actor !== null) {
      setActor(
        options.actor ?? {
          id: PARENT_USER_ID,
          userType: options.actorUserType ?? UserType.PARENT,
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

    return fn();
  });
}

function createService(extraAdapterMethods?: Record<string, jest.Mock>): {
  service: ParentAppAccessService;
  adapter: jest.Mocked<ParentAppGuardianReadAdapter>;
} {
  const adapter = {
    listCurrentSchoolGuardiansByUserId: jest.fn(),
    listLinkedStudentsForGuardians: jest.fn(),
    listActiveEnrollmentsForLinkedStudents: jest.fn(),
    findOwnedActiveEnrollmentForStudent: jest.fn(),
    findOwnedEnrollmentById: jest.fn(),
    findOwnedClassroomEnrollment: jest.fn(),
    ...extraAdapterMethods,
  } as unknown as jest.Mocked<ParentAppGuardianReadAdapter>;

  return {
    service: new ParentAppAccessService(adapter),
    adapter,
  };
}

function createServiceWithValidContext(): {
  service: ParentAppAccessService;
  adapter: jest.Mocked<ParentAppGuardianReadAdapter>;
} {
  const created = createService();
  created.adapter.listCurrentSchoolGuardiansByUserId.mockResolvedValue([
    guardianFixture(),
  ]);
  created.adapter.listLinkedStudentsForGuardians.mockResolvedValue([
    linkFixture(),
  ]);
  created.adapter.listActiveEnrollmentsForLinkedStudents.mockResolvedValue([
    enrollmentFixture(),
  ]);

  return created;
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
