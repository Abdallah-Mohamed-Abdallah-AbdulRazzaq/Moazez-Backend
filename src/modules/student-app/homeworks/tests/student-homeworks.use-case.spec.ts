import {
  HomeworkSubmissionStatus,
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
  GetStudentHomeworkSubmissionUseCase,
  ListStudentHomeworksUseCase,
  SaveStudentHomeworkSubmissionUseCase,
  SubmitStudentHomeworkSubmissionUseCase,
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

  it('returns the current homework submission for the current student context', async () => {
    const { getSubmissionUseCase, getSubmissionCoreUseCase } =
      createUseCasesWithValidAccess();
    getSubmissionCoreUseCase.execute.mockResolvedValue(submissionFixture());

    const response = await getSubmissionUseCase.execute('homework-1');

    expect(getSubmissionCoreUseCase.execute).toHaveBeenCalledWith({
      homeworkId: 'homework-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
    });
    expect(response.submission).toEqual(
      expect.objectContaining({
        id: 'submission-1',
        homeworkId: 'homework-1',
        status: 'draft',
        bodyText: 'Draft answer',
      }),
    );
    expect(JSON.stringify(response)).not.toContain('schoolId');
    expect(JSON.stringify(response)).not.toContain('enrollmentId');
  });

  it('saves a student homework submission draft through Homework Core', async () => {
    const { saveSubmissionUseCase, saveSubmissionCoreUseCase } =
      createUseCasesWithValidAccess();
    saveSubmissionCoreUseCase.execute.mockResolvedValue(submissionFixture());

    await saveSubmissionUseCase.execute('homework-1', {
      bodyText: 'Draft answer',
    });

    expect(saveSubmissionCoreUseCase.execute).toHaveBeenCalledWith({
      homeworkId: 'homework-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      bodyText: 'Draft answer',
    });
  });

  it('submits student homework through Homework Core', async () => {
    const { submitSubmissionUseCase, submitSubmissionCoreUseCase } =
      createUseCasesWithValidAccess();
    submitSubmissionCoreUseCase.execute.mockResolvedValue(
      submissionFixture({
        status: HomeworkSubmissionStatus.SUBMITTED,
        submittedAt: new Date('2026-05-25T09:00:00.000Z'),
      }),
    );

    const response = await submitSubmissionUseCase.execute('homework-1', {
      bodyText: 'Final answer',
    });

    expect(submitSubmissionCoreUseCase.execute).toHaveBeenCalledWith({
      homeworkId: 'homework-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      bodyText: 'Final answer',
    });
    expect(response.submission).toMatchObject({
      status: 'submitted',
      submittedAt: '2026-05-25T09:00:00.000Z',
    });
  });
});

function createUseCases(): {
  listUseCase: ListStudentHomeworksUseCase;
  getUseCase: GetStudentHomeworkUseCase;
  accessService: jest.Mocked<StudentAppAccessService>;
  readAdapter: jest.Mocked<StudentHomeworksReadAdapter>;
  getSubmissionCoreUseCase: { execute: jest.Mock };
  saveSubmissionCoreUseCase: { execute: jest.Mock };
  submitSubmissionCoreUseCase: { execute: jest.Mock };
  getSubmissionUseCase: GetStudentHomeworkSubmissionUseCase;
  saveSubmissionUseCase: SaveStudentHomeworkSubmissionUseCase;
  submitSubmissionUseCase: SubmitStudentHomeworkSubmissionUseCase;
} {
  const accessService = {
    getCurrentStudentWithEnrollment: jest.fn(),
  } as unknown as jest.Mocked<StudentAppAccessService>;
  const readAdapter = {
    listHomeworks: jest.fn(),
    findHomework: jest.fn(),
  } as unknown as jest.Mocked<StudentHomeworksReadAdapter>;
  const getSubmissionCoreUseCase = { execute: jest.fn() };
  const saveSubmissionCoreUseCase = { execute: jest.fn() };
  const submitSubmissionCoreUseCase = { execute: jest.fn() };

  return {
    listUseCase: new ListStudentHomeworksUseCase(accessService, readAdapter),
    getUseCase: new GetStudentHomeworkUseCase(accessService, readAdapter),
    getSubmissionUseCase: new GetStudentHomeworkSubmissionUseCase(
      accessService,
      getSubmissionCoreUseCase as any,
    ),
    saveSubmissionUseCase: new SaveStudentHomeworkSubmissionUseCase(
      accessService,
      saveSubmissionCoreUseCase as any,
    ),
    submitSubmissionUseCase: new SubmitStudentHomeworkSubmissionUseCase(
      accessService,
      submitSubmissionCoreUseCase as any,
    ),
    accessService,
    readAdapter,
    getSubmissionCoreUseCase,
    saveSubmissionCoreUseCase,
    submitSubmissionCoreUseCase,
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

function submissionFixture(overrides?: Record<string, unknown>): any {
  return {
    id: 'submission-1',
    schoolId: 'school-1',
    homeworkAssignmentId: 'homework-1',
    homeworkTargetId: 'target-1',
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    status: HomeworkSubmissionStatus.DRAFT,
    bodyText: 'Draft answer',
    submittedAt: null,
    createdAt: new Date('2026-05-25T08:00:00.000Z'),
    updatedAt: new Date('2026-05-25T08:05:00.000Z'),
    ...overrides,
  };
}
