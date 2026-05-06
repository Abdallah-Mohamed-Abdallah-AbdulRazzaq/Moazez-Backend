import {
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import type { RequestContext } from '../../../../common/context/request-context';
import {
  StudentAppClassroomNotFoundException,
  StudentAppEnrollmentNotFoundException,
  StudentAppRequiredStudentException,
  StudentAppStudentNotFoundException,
} from '../student-app-errors';
import type {
  StudentAppContext,
  StudentAppEnrollmentRecord,
  StudentAppLinkedUserRecord,
  StudentAppStudentRecord,
} from '../student-app.types';
import {
  assertStudentAppActiveEnrollment,
  assertStudentAppLinkedStudent,
  assertStudentAppOwnsClassroomEnrollmentRecord,
  assertStudentAppOwnsEnrollmentRecord,
  assertStudentAppOwnsStudentRecord,
  buildStudentAppBaseContextFromRequestContext,
  buildStudentAppContext,
  STUDENT_APP_CLASSROOM_ID_BACKING_MODEL,
  STUDENT_APP_ENROLLMENT_ID_BACKING_MODEL,
  STUDENT_APP_STUDENT_ID_BACKING_MODEL,
} from '../student-app-domain';

const STUDENT_USER_ID = 'student-user-1';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';
const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';

describe('Student App domain helpers', () => {
  it('builds a compact student context from RequestContext', () => {
    const result = buildStudentAppBaseContextFromRequestContext(
      requestContextFixture(),
    );

    expect(result).toEqual({
      studentUserId: STUDENT_USER_ID,
      schoolId: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
      membershipId: 'membership-1',
      roleId: 'role-1',
      requestedAcademicYearId: 'year-1',
      requestedTermId: 'term-1',
      permissions: ['students.records.view'],
    });
  });

  it('rejects missing, non-student, and incomplete student contexts', () => {
    expect(() =>
      buildStudentAppBaseContextFromRequestContext(undefined),
    ).toThrow(StudentAppRequiredStudentException);

    expect(() =>
      buildStudentAppBaseContextFromRequestContext(
        requestContextFixture({ userType: UserType.PARENT }),
      ),
    ).toThrow(StudentAppRequiredStudentException);

    expect(() =>
      buildStudentAppBaseContextFromRequestContext(
        requestContextFixture({ activeMembership: undefined }),
      ),
    ).toThrow(StudentAppRequiredStudentException);

    expect(() =>
      buildStudentAppBaseContextFromRequestContext(
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
    ).toThrow(StudentAppRequiredStudentException);
  });

  it('uses Student.id, Enrollment.id, and Enrollment.classroomId as ownership backing ids', () => {
    expect(STUDENT_APP_STUDENT_ID_BACKING_MODEL).toBe('Student.id');
    expect(STUDENT_APP_ENROLLMENT_ID_BACKING_MODEL).toBe('Enrollment.id');
    expect(STUDENT_APP_CLASSROOM_ID_BACKING_MODEL).toBe(
      'Enrollment.classroomId',
    );
  });

  it('accepts an active linked student and active enrollment', () => {
    const baseContext = buildStudentAppBaseContextFromRequestContext(
      requestContextFixture(),
    );
    const student = assertStudentAppLinkedStudent({
      context: baseContext,
      student: studentFixture(),
    });
    const enrollment = assertStudentAppActiveEnrollment({
      context: baseContext,
      student,
      enrollment: enrollmentFixture(),
    });

    expect(
      buildStudentAppContext({ baseContext, student, enrollment }),
    ).toMatchObject({
      studentUserId: STUDENT_USER_ID,
      studentId: STUDENT_ID,
      enrollmentId: ENROLLMENT_ID,
      classroomId: 'classroom-1',
      schoolId: SCHOOL_ID,
      organizationId: ORGANIZATION_ID,
      academicYearId: 'year-1',
      termId: 'term-1',
    });
  });

  it('rejects inactive, deleted, or non-student linked records as not found', () => {
    const context = buildStudentAppBaseContextFromRequestContext(
      requestContextFixture(),
    );

    expect(() =>
      assertStudentAppLinkedStudent({
        context,
        student: studentFixture({ status: StudentStatus.SUSPENDED }),
      }),
    ).toThrow(StudentAppStudentNotFoundException);

    expect(() =>
      assertStudentAppLinkedStudent({
        context,
        student: studentFixture({ deletedAt: new Date() }),
      }),
    ).toThrow(StudentAppStudentNotFoundException);

    expect(() =>
      assertStudentAppLinkedStudent({
        context,
        student: studentFixture({
          user: linkedUserFixture({ userType: UserType.PARENT }),
        }),
      }),
    ).toThrow(StudentAppStudentNotFoundException);
  });

  it('rejects inactive or mismatched active enrollment records as not found', () => {
    const context = buildStudentAppBaseContextFromRequestContext(
      requestContextFixture(),
    );
    const student = studentFixture();

    expect(() =>
      assertStudentAppActiveEnrollment({
        context,
        student,
        enrollment: null,
      }),
    ).toThrow(StudentAppEnrollmentNotFoundException);

    expect(() =>
      assertStudentAppActiveEnrollment({
        context,
        student,
        enrollment: enrollmentFixture({
          status: StudentEnrollmentStatus.WITHDRAWN,
        }),
      }),
    ).toThrow(StudentAppEnrollmentNotFoundException);

    expect(() =>
      assertStudentAppActiveEnrollment({
        context,
        student,
        enrollment: enrollmentFixture({ academicYearId: 'other-year' }),
      }),
    ).toThrow(StudentAppEnrollmentNotFoundException);
  });

  it('hides guessed student, enrollment, and classroom ids as not found', () => {
    const context = studentAppContextFixture();

    expect(() =>
      assertStudentAppOwnsStudentRecord({
        context,
        student: null,
        studentId: 'same-school-other-student',
      }),
    ).toThrow(StudentAppStudentNotFoundException);

    expect(() =>
      assertStudentAppOwnsEnrollmentRecord({
        context,
        enrollment: null,
        enrollmentId: 'cross-school-enrollment',
      }),
    ).toThrow(StudentAppEnrollmentNotFoundException);

    expect(() =>
      assertStudentAppOwnsClassroomEnrollmentRecord({
        context,
        enrollment: null,
        classroomId: 'cross-school-classroom',
      }),
    ).toThrow(StudentAppClassroomNotFoundException);
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
      id: STUDENT_USER_ID,
      userType: overrides?.userType ?? UserType.STUDENT,
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
    academicContext: {
      academicYearId: 'year-1',
      termId: 'term-1',
    },
    bypass: { bypassSchoolScope: false, includeSoftDeleted: false },
  };
}

function studentAppContextFixture(): StudentAppContext {
  return {
    studentUserId: STUDENT_USER_ID,
    studentId: STUDENT_ID,
    schoolId: SCHOOL_ID,
    organizationId: ORGANIZATION_ID,
    membershipId: 'membership-1',
    roleId: 'role-1',
    enrollmentId: ENROLLMENT_ID,
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    requestedAcademicYearId: 'year-1',
    requestedTermId: 'term-1',
    permissions: ['students.records.view'],
  };
}

function linkedUserFixture(
  overrides?: Partial<StudentAppLinkedUserRecord>,
): StudentAppLinkedUserRecord {
  return {
    id: STUDENT_USER_ID,
    userType: UserType.STUDENT,
    status: UserStatus.ACTIVE,
    deletedAt: null,
    ...overrides,
  };
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
    user: linkedUserFixture(),
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
    classroomId: 'classroom-1',
    status: StudentEnrollmentStatus.ACTIVE,
    deletedAt: null,
    ...overrides,
  };
}
