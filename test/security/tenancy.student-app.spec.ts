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
import { StudentAppAccessService } from '../../src/modules/student-app/access/student-app-access.service';
import { StudentAppStudentReadAdapter } from '../../src/modules/student-app/access/student-app-student-read.adapter';
import type {
  StudentAppEnrollmentRecord,
  StudentAppStudentRecord,
} from '../../src/modules/student-app/shared/student-app.types';

const STUDENT_USER_ID = 'student-user-1';
const STUDENT_ID = 'student-1';
const ENROLLMENT_ID = 'enrollment-1';
const CLASSROOM_ID = 'classroom-1';
const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';

describe('Student App ownership foundation (security)', () => {
  it('does not allow a linked student identity to access another same-school student', async () => {
    const { service, adapter } = createValidService();
    adapter.findOwnedStudentById.mockResolvedValue(null);

    await expect(
      withStudentRequestContext(() =>
        service.assertStudentOwnsStudent('same-school-other-student'),
      ),
    ).rejects.toMatchObject({
      code: 'student_app.student.not_found',
    });
    expect(adapter.findOwnedStudentById).toHaveBeenCalledWith({
      studentId: 'same-school-other-student',
      studentUserId: STUDENT_USER_ID,
    });
  });

  it('hides cross-school guessed student, enrollment, and classroom ids', async () => {
    const { service, adapter } = createValidService();
    adapter.findOwnedStudentById.mockResolvedValue(null);
    adapter.findOwnedEnrollmentById.mockResolvedValue(null);
    adapter.findOwnedClassroomEnrollment.mockResolvedValue(null);

    await expect(
      withStudentRequestContext(() =>
        service.assertStudentOwnsStudent('cross-school-student'),
      ),
    ).rejects.toMatchObject({
      code: 'student_app.student.not_found',
    });
    await expect(
      withStudentRequestContext(() =>
        service.assertStudentOwnsEnrollment('cross-school-enrollment'),
      ),
    ).rejects.toMatchObject({
      code: 'student_app.enrollment.not_found',
    });
    await expect(
      withStudentRequestContext(() =>
        service.assertStudentOwnsClassroom('cross-school-classroom'),
      ),
    ).rejects.toMatchObject({
      code: 'student_app.classroom.not_found',
    });
  });

  it('requires the authenticated actor to be a student with an active school membership', async () => {
    const { service } = createValidService();

    await expect(
      withStudentRequestContext(() => service.getStudentAppContext(), {
        userType: UserType.TEACHER,
      }),
    ).rejects.toMatchObject({
      code: 'student_app.actor.required_student',
    });

    await expect(
      runWithRequestContext(createRequestContext(), async () => {
        setActor({ id: STUDENT_USER_ID, userType: UserType.STUDENT });
        return service.getStudentAppContext();
      }),
    ).rejects.toMatchObject({
      code: 'student_app.actor.required_student',
    });
  });
});

async function withStudentRequestContext<T>(
  fn: () => T | Promise<T>,
  options?: { userType?: UserType },
): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({
      id: STUDENT_USER_ID,
      userType: options?.userType ?? UserType.STUDENT,
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
  service: StudentAppAccessService;
  adapter: jest.Mocked<StudentAppStudentReadAdapter>;
} {
  const adapter = {
    findLinkedStudentByUserId: jest.fn().mockResolvedValue(studentFixture()),
    findActiveEnrollmentForStudent: jest
      .fn()
      .mockResolvedValue(enrollmentFixture()),
    findOwnedStudentById: jest.fn(),
    findOwnedEnrollmentById: jest.fn(),
    findOwnedClassroomEnrollment: jest.fn(),
  } as unknown as jest.Mocked<StudentAppStudentReadAdapter>;

  return {
    service: new StudentAppAccessService(adapter),
    adapter,
  };
}

function studentFixture(): StudentAppStudentRecord {
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
  };
}

function enrollmentFixture(): StudentAppEnrollmentRecord {
  return {
    id: ENROLLMENT_ID,
    schoolId: SCHOOL_ID,
    studentId: STUDENT_ID,
    academicYearId: 'year-1',
    termId: null,
    classroomId: CLASSROOM_ID,
    status: StudentEnrollmentStatus.ACTIVE,
    deletedAt: null,
  };
}
