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
import { GetStudentTaskUseCase } from '../application/get-student-task.use-case';
import { ListStudentTaskSubmissionsUseCase } from '../application/list-student-task-submissions.use-case';
import { ListStudentTasksUseCase } from '../application/list-student-tasks.use-case';
import { StudentTasksReadAdapter } from '../infrastructure/student-tasks-read.adapter';

describe('Student Tasks use-cases', () => {
  it('rejects non-student actors through StudentAppAccessService', async () => {
    const { listUseCase, accessService, readAdapter } = createUseCases();
    accessService.getCurrentStudentWithEnrollment.mockRejectedValue(
      new StudentAppRequiredStudentException({ reason: 'actor_not_student' }),
    );

    await expect(listUseCase.execute()).rejects.toMatchObject({
      code: 'student_app.actor.required_student',
    });
    expect(readAdapter.listTasks).not.toHaveBeenCalled();
  });

  it('lists visible tasks for the current student context only', async () => {
    const { listUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.listTasks.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 50,
    });
    readAdapter.getSummary.mockResolvedValue(summaryFixture());

    await listUseCase.execute({ status: 'pending' });

    expect(readAdapter.listTasks).toHaveBeenCalledWith({
      context: contextFixture(),
      query: { status: 'pending' },
    });
    expect(readAdapter.getSummary).toHaveBeenCalledWith(contextFixture());
  });

  it('returns safe 404 for inaccessible task detail', async () => {
    const { getUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.findTask.mockResolvedValue(null);

    await expect(getUseCase.execute('task-1')).rejects.toBeInstanceOf(
      NotFoundDomainException,
    );
  });

  it('returns safe 404 for inaccessible task submissions', async () => {
    const { submissionsUseCase, readAdapter } = createUseCasesWithValidAccess();
    readAdapter.listTaskSubmissions.mockResolvedValue(null);

    await expect(submissionsUseCase.execute('task-1')).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

function createUseCases(): {
  listUseCase: ListStudentTasksUseCase;
  getUseCase: GetStudentTaskUseCase;
  submissionsUseCase: ListStudentTaskSubmissionsUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  readAdapter: jest.Mocked<StudentTasksReadAdapter>;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest.fn(),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const readAdapter = {
    listTasks: jest.fn(),
    getSummary: jest.fn(),
    findTask: jest.fn(),
    listTaskSubmissions: jest.fn(),
  } as unknown as jest.Mocked<StudentTasksReadAdapter>;

  return {
    listUseCase: new ListStudentTasksUseCase(accessService, readAdapter),
    getUseCase: new GetStudentTaskUseCase(accessService, readAdapter),
    submissionsUseCase: new ListStudentTaskSubmissionsUseCase(
      accessService,
      readAdapter,
    ),
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

function summaryFixture() {
  return {
    total: 0,
    pending: 0,
    inProgress: 0,
    underReview: 0,
    completed: 0,
    overdue: 0,
  };
}
