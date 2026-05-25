import {
  StudentEnrollmentStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { StudentAppAccessService } from '../../access/student-app-access.service';
import { StudentAppRequiredStudentException } from '../../shared/student-app-errors';
import type {
  StudentAppContext,
  StudentAppCurrentStudentWithEnrollment,
} from '../../shared/student-app.types';
import {
  GetStudentHomeworkUseCase,
  ListStudentHomeworksUseCase,
} from '../application/student-homeworks.use-cases';
import { StudentHomeworksReadAdapter } from '../infrastructure/student-homeworks-read.adapter';

describe('Student Homeworks use-cases', () => {
  it('rejects non-student actors through StudentAppAccessService', async () => {
    const { listUseCase, accessService, readAdapter } = createUseCases();
    accessService.getCurrentStudentWithEnrollment.mockRejectedValue(
      new StudentAppRequiredStudentException({ reason: 'actor_not_student' }),
    );

    await expect(listUseCase.execute()).rejects.toMatchObject({
      code: 'student_app.actor.required_student',
    });
    expect(readAdapter.listHomeworks).not.toHaveBeenCalled();
  });

  it('lists visible homework targets for the current student context only', async () => {
    const { listUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.listHomeworks.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 25,
    });

    await listUseCase.execute({ status: 'waiting', search: 'math' });

    expect(readAdapter.listHomeworks).toHaveBeenCalledWith({
      context: contextFixture(),
      query: { status: 'waiting', search: 'math' },
    });
  });

  it('returns safe 404 for inaccessible homework detail', async () => {
    const { getUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.findHomework.mockResolvedValue(null);

    await expect(getUseCase.execute('homework-1')).rejects.toBeInstanceOf(
      NotFoundDomainException,
    );
  });
});

function createUseCases(): {
  listUseCase: ListStudentHomeworksUseCase;
  getUseCase: GetStudentHomeworkUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  readAdapter: jest.Mocked<StudentHomeworksReadAdapter>;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest.fn(),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const readAdapter = {
    listHomeworks: jest.fn(),
    findHomework: jest.fn(),
  } as unknown as jest.Mocked<StudentHomeworksReadAdapter>;

  return {
    listUseCase: new ListStudentHomeworksUseCase(accessService, readAdapter),
    getUseCase: new GetStudentHomeworkUseCase(accessService, readAdapter),
    accessService,
    readAdapter,
  };
}

function createUseCasesWithValidAccess(): ReturnType<typeof createUseCases> {
  const created = createUseCases();
  created.accessService.getCurrentStudentWithEnrollment.mockResolvedValue(
    currentStudentFixture(),
  );
  return created;
}

function currentStudentFixture(): StudentAppCurrentStudentWithEnrollment {
  return {
    context: contextFixture(),
    student: {
      id: 'student-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      userId: 'student-user-1',
      status: StudentStatus.ACTIVE,
      deletedAt: null,
      user: {
        id: 'student-user-1',
        userType: UserType.STUDENT,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
    },
    enrollment: {
      id: 'enrollment-1',
      schoolId: 'school-1',
      studentId: 'student-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      classroomId: 'classroom-1',
      status: StudentEnrollmentStatus.ACTIVE,
      deletedAt: null,
    },
  };
}

function contextFixture(): StudentAppContext {
  return {
    studentUserId: 'student-user-1',
    studentId: 'student-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: [],
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    requestedAcademicYearId: 'year-1',
    requestedTermId: 'term-1',
    termId: 'term-1',
  };
}
