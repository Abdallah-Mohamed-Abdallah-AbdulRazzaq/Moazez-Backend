import {
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import type { RequestContext } from '../../../../common/context/request-context';
import {
  ParentAppChildNotFoundException,
  ParentAppClassroomNotFoundException,
  ParentAppEnrollmentNotFoundException,
  ParentAppGuardianNotFoundException,
  ParentAppRequiredParentException,
} from '../parent-app-errors';
import type {
  ParentAppContext,
  ParentAppEnrollmentRecord,
  ParentAppGuardianRecord,
  ParentAppLinkedUserRecord,
  ParentAppStudentGuardianLinkRecord,
} from '../parent-app.types';
import {
  assertParentAppActiveCurrentSchoolChildren,
  assertParentAppGuardians,
  assertParentAppLinkedStudentLinks,
  assertParentAppOwnsChildEnrollmentRecord,
  assertParentAppOwnsClassroomEnrollmentRecord,
  assertParentAppOwnsEnrollmentRecord,
  buildParentAppBaseContextFromRequestContext,
  buildParentAppContext,
  PARENT_APP_CHILD_ID_BACKING_MODEL,
  PARENT_APP_CLASSROOM_ID_BACKING_MODEL,
  PARENT_APP_CURRENT_SCHOOL_ONLY_GUARDRAIL,
  PARENT_APP_ENROLLMENT_ID_BACKING_MODEL,
  PARENT_APP_GUARDIAN_ID_BACKING_MODEL,
} from '../parent-app-domain';

const PARENT_USER_ID = 'parent-user-1';
const GUARDIAN_ID = 'guardian-1';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';
const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';

describe('Parent App domain helpers', () => {
  it('builds a compact parent context from RequestContext', () => {
    const result = buildParentAppBaseContextFromRequestContext(
      requestContextFixture(),
    );

    expect(result).toEqual({
      parentUserId: PARENT_USER_ID,
      schoolId: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
      membershipId: 'membership-1',
      roleId: 'role-1',
      permissions: ['students.records.view'],
    });
  });

  it('rejects missing, non-parent, and incomplete parent contexts', () => {
    expect(() =>
      buildParentAppBaseContextFromRequestContext(undefined),
    ).toThrow(ParentAppRequiredParentException);

    expect(() =>
      buildParentAppBaseContextFromRequestContext(
        requestContextFixture({ userType: UserType.STUDENT }),
      ),
    ).toThrow(ParentAppRequiredParentException);

    expect(() =>
      buildParentAppBaseContextFromRequestContext(
        requestContextFixture({ activeMembership: undefined }),
      ),
    ).toThrow(ParentAppRequiredParentException);

    expect(() =>
      buildParentAppBaseContextFromRequestContext(
        requestContextFixture({
          activeMembership: {
            membershipId: 'membership-1',
            schoolId: null,
            organizationId: ORGANIZATION_ID,
            roleId: 'role-1',
            permissions: [],
          },
        }),
      ),
    ).toThrow(ParentAppRequiredParentException);
  });

  it('documents backing models and the current-school-only guardrail', () => {
    expect(PARENT_APP_GUARDIAN_ID_BACKING_MODEL).toBe('Guardian.id');
    expect(PARENT_APP_CHILD_ID_BACKING_MODEL).toBe('Student.id');
    expect(PARENT_APP_ENROLLMENT_ID_BACKING_MODEL).toBe('Enrollment.id');
    expect(PARENT_APP_CLASSROOM_ID_BACKING_MODEL).toBe(
      'Enrollment.classroomId',
    );
    expect(
      PARENT_APP_CURRENT_SCHOOL_ONLY_GUARDRAIL.crossSchoolAggregationEnabled,
    ).toBe(false);
  });

  it('accepts current-school guardians, links, and active enrollments', () => {
    const baseContext = buildParentAppBaseContextFromRequestContext(
      requestContextFixture(),
    );
    const guardians = assertParentAppGuardians({
      context: baseContext,
      guardians: [guardianFixture()],
    });
    const links = assertParentAppLinkedStudentLinks({
      context: baseContext,
      guardianIds: [GUARDIAN_ID],
      links: [linkFixture()],
    });
    const context = buildParentAppContext({
      baseContext,
      guardians,
      links,
      enrollments: [enrollmentFixture()],
    });

    expect(context).toMatchObject({
      parentUserId: PARENT_USER_ID,
      guardianIds: [GUARDIAN_ID],
      children: [
        {
          studentId: STUDENT_ID,
          enrollmentId: ENROLLMENT_ID,
          classroomId: 'classroom-1',
          academicYearId: 'year-1',
          termId: null,
        },
      ],
    });
  });

  it('rejects invalid guardian and linked child records as safe not found', () => {
    const context = buildParentAppBaseContextFromRequestContext(
      requestContextFixture(),
    );

    expect(() =>
      assertParentAppGuardians({
        context,
        guardians: [],
      }),
    ).toThrow(ParentAppGuardianNotFoundException);

    expect(() =>
      assertParentAppGuardians({
        context,
        guardians: [
          guardianFixture({
            user: linkedUserFixture({ userType: UserType.STUDENT }),
          }),
        ],
      }),
    ).toThrow(ParentAppGuardianNotFoundException);

    expect(() =>
      assertParentAppLinkedStudentLinks({
        context,
        guardianIds: [GUARDIAN_ID],
        links: [
          linkFixture({
            student: studentRecordFixture({ status: StudentStatus.SUSPENDED }),
          }),
        ],
      }),
    ).toThrow(ParentAppChildNotFoundException);
  });

  it('rejects inactive or mismatched active enrollments as not found', () => {
    const context = buildParentAppBaseContextFromRequestContext(
      requestContextFixture(),
    );
    const links = [linkFixture()];

    expect(() =>
      assertParentAppActiveCurrentSchoolChildren({
        context,
        links,
        enrollments: [],
      }),
    ).toThrow(ParentAppEnrollmentNotFoundException);

    expect(() =>
      assertParentAppActiveCurrentSchoolChildren({
        context,
        links,
        enrollments: [
          enrollmentFixture({ status: StudentEnrollmentStatus.WITHDRAWN }),
        ],
      }),
    ).toThrow(ParentAppEnrollmentNotFoundException);

    expect(() =>
      assertParentAppActiveCurrentSchoolChildren({
        context,
        links,
        enrollments: [enrollmentFixture({ studentId: 'unlinked-student' })],
      }),
    ).toThrow(ParentAppEnrollmentNotFoundException);
  });

  it('hides guessed child, enrollment, and classroom ids as safe not found', () => {
    const context = parentAppContextFixture();

    expect(() =>
      assertParentAppOwnsChildEnrollmentRecord({
        context,
        enrollment: null,
        studentId: 'same-school-unlinked-student',
      }),
    ).toThrow(ParentAppChildNotFoundException);

    expect(() =>
      assertParentAppOwnsEnrollmentRecord({
        context,
        enrollment: null,
        enrollmentId: 'cross-school-enrollment',
      }),
    ).toThrow(ParentAppEnrollmentNotFoundException);

    expect(() =>
      assertParentAppOwnsClassroomEnrollmentRecord({
        context,
        enrollment: null,
        classroomId: 'cross-school-classroom',
      }),
    ).toThrow(ParentAppClassroomNotFoundException);
  });
});

function requestContextFixture(
  overrides?: Partial<{
    userType: UserType;
    activeMembership: RequestContext['activeMembership'];
  }>,
): RequestContext {
  return {
    requestId: 'request-1',
    actor: {
      id: PARENT_USER_ID,
      userType: overrides?.userType ?? UserType.PARENT,
    },
    activeMembership:
      overrides && 'activeMembership' in overrides
        ? overrides.activeMembership
        : {
            membershipId: 'membership-1',
            schoolId: SCHOOL_ID,
            organizationId: ORGANIZATION_ID,
            roleId: 'role-1',
            permissions: ['students.records.view'],
          },
    bypass: { bypassSchoolScope: false, includeSoftDeleted: false },
  };
}

function parentAppContextFixture(): ParentAppContext {
  return {
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
        classroomId: 'classroom-1',
        academicYearId: 'year-1',
        termId: null,
      },
    ],
    permissions: ['students.records.view'],
  };
}

function linkedUserFixture(
  overrides?: Partial<ParentAppLinkedUserRecord>,
): ParentAppLinkedUserRecord {
  return {
    id: PARENT_USER_ID,
    userType: UserType.PARENT,
    status: UserStatus.ACTIVE,
    deletedAt: null,
    ...overrides,
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
    user: linkedUserFixture(),
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
    termId: null,
    classroomId: 'classroom-1',
    status: StudentEnrollmentStatus.ACTIVE,
    deletedAt: null,
    student: studentRecordFixture(),
    ...overrides,
  };
}
