import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import { ParentTasksReadAdapter } from '../infrastructure/parent-tasks-read.adapter';

describe('ParentTasksReadAdapter', () => {
  it('uses scoped Prisma and owned child assignment filters for task reads', async () => {
    const { adapter, assignmentMocks } = createAdapter();
    assignmentMocks.findMany.mockResolvedValue([]);
    assignmentMocks.count.mockResolvedValue(0);

    await adapter.listTasks({
      child: childFixture(),
      query: { status: 'pending', search: 'math' },
    });

    expect(assignmentMocks.findMany.mock.calls[0][0].where).toMatchObject({
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      task: {
        is: {
          deletedAt: null,
        },
      },
    });
    expect(assignmentMocks.findMany.mock.calls[0][0].where).not.toHaveProperty(
      'schoolId',
    );
  });

  it('performs no task/submission mutations or platform bypass calls', async () => {
    const {
      adapter,
      assignmentMocks,
      submissionMocks,
      mutationMocks,
      platformBypass,
    } = createAdapter();
    assignmentMocks.findFirst.mockResolvedValue(null);
    submissionMocks.findFirst.mockResolvedValue(null);

    await adapter.findTask({ child: childFixture(), taskId: 'task-1' });
    await adapter.findTaskSubmission({
      child: childFixture(),
      taskId: 'task-1',
      submissionId: 'submission-1',
    });

    for (const mutation of Object.values(mutationMocks)) {
      expect(mutation).not.toHaveBeenCalled();
    }
    expect(platformBypass).not.toHaveBeenCalled();
  });
});

function childFixture(): ParentAppAccessibleChild {
  return {
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: 'term-1',
  };
}

function modelMocks() {
  return {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
}

function createAdapter(): {
  adapter: ParentTasksReadAdapter;
  assignmentMocks: ReturnType<typeof modelMocks>;
  submissionMocks: ReturnType<typeof modelMocks>;
  mutationMocks: Record<string, jest.Mock>;
  platformBypass: jest.Mock;
} {
  const assignmentMocks = modelMocks();
  const submissionMocks = modelMocks();
  const platformBypass = jest.fn();
  const prisma = {
    platformBypass,
    scoped: {
      reinforcementAssignment: assignmentMocks,
      reinforcementSubmission: submissionMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new ParentTasksReadAdapter(prisma),
    assignmentMocks,
    submissionMocks,
    mutationMocks: {
      assignmentCreate: assignmentMocks.create,
      assignmentUpdate: assignmentMocks.update,
      assignmentDelete: assignmentMocks.delete,
      submissionCreate: submissionMocks.create,
      submissionUpdate: submissionMocks.update,
      submissionDelete: submissionMocks.delete,
    },
    platformBypass,
  };
}
