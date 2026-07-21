/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/unbound-method -- Security metadata and Jest mock assertions intentionally inspect framework-owned methods and errors. */
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { SCHOOL_MANAGEMENT_ONLY_METADATA } from '../../src/common/decorators/school-management-only.decorator';
import { PermissionsGuard } from '../../src/common/guards/permissions.guard';
import { StudentAppAccessService } from '../../src/modules/student-app/access/student-app-access.service';
import { StudentAppStudentReadAdapter } from '../../src/modules/student-app/access/student-app-student-read.adapter';
import { StudentSubjectLessonsController } from '../../src/modules/student-app/subjects/controller/student-subject-lessons.controller';

describe('Student Subject lesson discovery security boundary', () => {
  it('requires both permissions and no management-only shortcut', () => {
    const handler = StudentSubjectLessonsController.prototype.listLessons;

    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_METADATA, handler)).toEqual(
      ['academics.subjects.view', 'academics.lesson_plans.view'],
    );
    expect(
      Reflect.getMetadata(SCHOOL_MANAGEMENT_ONLY_METADATA, handler),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        SCHOOL_MANAGEMENT_ONLY_METADATA,
        StudentSubjectLessonsController,
      ),
    ).toBeUndefined();
  });

  it.each([
    UserType.PARENT,
    UserType.TEACHER,
    UserType.SCHOOL_USER,
    UserType.ORGANIZATION_USER,
    UserType.PLATFORM_USER,
    UserType.APPLICANT,
    UserType.PICKUP_DELEGATE,
    UserType.DISMISSAL_STAFF,
    UserType.SERVICE_ACCOUNT,
  ])(
    'rejects %s before Student or enrollment lookup even with both permission strings',
    async (userType) => {
      const { service, adapter } = createAccessService();

      await expect(
        withContext(userType, () => service.getCurrentStudentWithEnrollment()),
      ).rejects.toMatchObject({
        code: 'student_app.actor.required_student',
        httpStatus: 403,
      });
      expect(adapter.findLinkedStudentByUserId).not.toHaveBeenCalled();
      expect(adapter.findActiveEnrollmentForStudent).not.toHaveBeenCalled();
    },
  );

  it.each([
    [['academics.lesson_plans.view'], 'academics.subjects.view'],
    [['academics.subjects.view'], 'academics.lesson_plans.view'],
  ])(
    'rejects a Student missing one required permission',
    (permissions, missingPermission) => {
      const guard = new PermissionsGuard(new Reflector());
      const executionContext = {
        getHandler: () => StudentSubjectLessonsController.prototype.listLessons,
        getClass: () => StudentSubjectLessonsController,
      } as unknown as ExecutionContext;

      expect(() =>
        runWithRequestContext(createRequestContext(), () => {
          setActor({ id: 'student-user', userType: UserType.STUDENT });
          setActiveMembership({
            membershipId: 'membership',
            organizationId: 'organization',
            schoolId: 'school',
            roleId: 'role',
            permissions,
          });
          return guard.canActivate(executionContext);
        }),
      ).toThrow(
        expect.objectContaining({
          code: 'auth.scope.missing',
          details: { missingPermissions: [missingPermission] },
        }),
      );
    },
  );

  it('allows only an exact active linked Student with an active enrollment', async () => {
    const { service, adapter } = createAccessService();
    adapter.findLinkedStudentByUserId.mockResolvedValue({
      id: 'student',
      schoolId: 'school',
      organizationId: 'organization',
      userId: 'student-user',
      status: StudentStatus.ACTIVE,
      deletedAt: null,
      user: {
        id: 'student-user',
        userType: UserType.STUDENT,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
    });
    adapter.findActiveEnrollmentForStudent.mockResolvedValue({
      id: 'enrollment',
      schoolId: 'school',
      studentId: 'student',
      academicYearId: 'year',
      termId: 'term',
      classroomId: 'classroom',
      status: StudentEnrollmentStatus.ACTIVE,
      deletedAt: null,
    });

    await expect(
      withContext(UserType.STUDENT, () =>
        service.getCurrentStudentWithEnrollment(),
      ),
    ).resolves.toMatchObject({
      context: {
        studentId: 'student',
        schoolId: 'school',
        organizationId: 'organization',
        classroomId: 'classroom',
        academicYearId: 'year',
        termId: 'term',
      },
    });
  });
});

function createAccessService(): {
  service: StudentAppAccessService;
  adapter: jest.Mocked<StudentAppStudentReadAdapter>;
} {
  const adapter = {
    findLinkedStudentByUserId: jest.fn(),
    findActiveEnrollmentForStudent: jest.fn(),
  } as unknown as jest.Mocked<StudentAppStudentReadAdapter>;
  return {
    service: new StudentAppAccessService(adapter),
    adapter,
  };
}

async function withContext<T>(
  userType: UserType,
  operation: () => T | Promise<T>,
): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({ id: 'student-user', userType });
    setActiveMembership({
      membershipId: 'membership',
      organizationId: 'organization',
      schoolId: 'school',
      roleId: 'custom-role',
      permissions: ['academics.subjects.view', 'academics.lesson_plans.view'],
    });
    return operation();
  });
}
