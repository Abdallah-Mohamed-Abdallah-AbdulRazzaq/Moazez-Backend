import { ParentAppAccessService } from '../../access/parent-app-access.service';
import { ParentAppRequiredParentException } from '../../shared/parent-app-errors';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import { GetParentChildTaskSubmissionUseCase } from '../application/get-parent-child-task-submission.use-case';
import { GetParentChildTaskUseCase } from '../application/get-parent-child-task.use-case';
import { GetParentChildTasksSummaryUseCase } from '../application/get-parent-child-tasks-summary.use-case';
import { ListParentChildTaskSubmissionsUseCase } from '../application/list-parent-child-task-submissions.use-case';
import { ListParentChildTasksUseCase } from '../application/list-parent-child-tasks.use-case';
import {
  ParentTasksReadAdapter,
  type ParentTasksListReadModel,
  type ParentTasksSummaryReadModel,
} from '../infrastructure/parent-tasks-read.adapter';

describe('Parent Tasks use-cases', () => {
  it('rejects non-parent actors through ParentAppAccessService', async () => {
    const { listUseCase, accessService, readAdapter } = createUseCases();
    accessService.assertParentOwnsStudent.mockRejectedValue(
      new ParentAppRequiredParentException({ reason: 'actor_not_parent' }),
    );

    await expect(listUseCase.execute('student-1')).rejects.toMatchObject({
      code: 'parent_app.actor.required_parent',
    });
    expect(readAdapter.listTasks).not.toHaveBeenCalled();
  });

  it('validates child ownership before listing child tasks', async () => {
    const { listUseCase, accessService, readAdapter } =
      createUseCasesWithValidAccess();
    readAdapter.listTasks.mockResolvedValue(listFixture());
    readAdapter.getSummary.mockResolvedValue(summaryFixture());

    const result = await listUseCase.execute('student-1', {
      status: 'pending',
    });

    expect(accessService.assertParentOwnsStudent).toHaveBeenCalledWith(
      'student-1',
    );
    expect(readAdapter.listTasks).toHaveBeenCalledWith({
      child: childFixture(),
      query: { status: 'pending' },
    });
    expect(result.child.studentId).toBe('student-1');
  });

  it('returns safe 404 when the task or submission is not owned-child visible', async () => {
    const { getTaskUseCase, getSubmissionUseCase, readAdapter } =
      createUseCasesWithValidAccess();
    readAdapter.findTask.mockResolvedValue(null);
    readAdapter.findTaskSubmission.mockResolvedValue(null);

    await expect(
      getTaskUseCase.execute('student-1', 'task-1'),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      getSubmissionUseCase.execute({
        studentId: 'student-1',
        taskId: 'task-1',
        submissionId: 'submission-1',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('does not expose task mutation behavior from read use-cases', async () => {
    const { summaryUseCase, submissionsUseCase, readAdapter } =
      createUseCasesWithValidAccess();
    readAdapter.getSummary.mockResolvedValue(summaryFixture());
    readAdapter.listTaskSubmissions.mockResolvedValue([]);

    await summaryUseCase.execute('student-1');
    await submissionsUseCase.execute('student-1', 'task-1');

    expect(readAdapter.getSummary).toHaveBeenCalledWith(childFixture());
    expect(readAdapter.listTaskSubmissions).toHaveBeenCalledWith({
      child: childFixture(),
      taskId: 'task-1',
    });
  });
});

function createUseCases(): {
  listUseCase: ListParentChildTasksUseCase;
  summaryUseCase: GetParentChildTasksSummaryUseCase;
  getTaskUseCase: GetParentChildTaskUseCase;
  submissionsUseCase: ListParentChildTaskSubmissionsUseCase;
  getSubmissionUseCase: GetParentChildTaskSubmissionUseCase;
  accessService: jest.Mocked<ParentAppAccessService>;
  readAdapter: jest.Mocked<ParentTasksReadAdapter>;
} {
  const accessService = {
    assertParentOwnsStudent: jest.fn(),
  } as unknown as jest.Mocked<ParentAppAccessService>;
  const readAdapter = {
    listTasks: jest.fn(),
    getSummary: jest.fn(),
    findTask: jest.fn(),
    listTaskSubmissions: jest.fn(),
    findTaskSubmission: jest.fn(),
  } as unknown as jest.Mocked<ParentTasksReadAdapter>;

  return {
    listUseCase: new ListParentChildTasksUseCase(accessService, readAdapter),
    summaryUseCase: new GetParentChildTasksSummaryUseCase(
      accessService,
      readAdapter,
    ),
    getTaskUseCase: new GetParentChildTaskUseCase(accessService, readAdapter),
    submissionsUseCase: new ListParentChildTaskSubmissionsUseCase(
      accessService,
      readAdapter,
    ),
    getSubmissionUseCase: new GetParentChildTaskSubmissionUseCase(
      accessService,
      readAdapter,
    ),
    accessService,
    readAdapter,
  };
}

function createUseCasesWithValidAccess(): ReturnType<typeof createUseCases> {
  const created = createUseCases();
  created.accessService.assertParentOwnsStudent.mockResolvedValue(
    childFixture(),
  );
  return created;
}

function childFixture(): ParentAppAccessibleChild {
  return {
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: 'term-1',
  };
}

function listFixture(): ParentTasksListReadModel {
  return {
    child: childFixture(),
    items: [],
    total: 0,
    page: 1,
    limit: 50,
  };
}

function summaryFixture(): ParentTasksSummaryReadModel {
  return {
    child: childFixture(),
    total: 1,
    pending: 1,
    inProgress: 0,
    underReview: 0,
    completed: 0,
    overdue: 0,
  };
}
