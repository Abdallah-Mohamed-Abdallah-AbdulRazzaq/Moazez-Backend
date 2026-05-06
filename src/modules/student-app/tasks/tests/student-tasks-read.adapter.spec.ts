import {
  ReinforcementTaskStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';
import { StudentTasksReadAdapter } from '../infrastructure/student-tasks-read.adapter';

describe('StudentTasksReadAdapter', () => {
  it('lists only the current student enrollment assignments', async () => {
    const { adapter, assignmentMocks } = createAdapter();
    assignmentMocks.findMany.mockResolvedValue([]);
    assignmentMocks.count.mockResolvedValue(0);

    await adapter.listTasks({
      context: contextFixture(),
      query: { status: 'in_progress', search: 'math' },
    });

    const query = assignmentMocks.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      academicYearId: 'year-1',
      termId: 'term-1',
      status: ReinforcementTaskStatus.IN_PROGRESS,
      task: {
        is: {
          deletedAt: null,
          status: { not: ReinforcementTaskStatus.CANCELLED },
        },
      },
    });
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('reads submissions for the current student assignment only', async () => {
    const { adapter, assignmentMocks, submissionMocks } = createAdapter();
    assignmentMocks.findFirst.mockResolvedValue({
      id: 'assignment-1',
      submissions: [],
    });
    submissionMocks.findFirst.mockResolvedValue(null);

    await adapter.findTaskSubmission({
      context: contextFixture(),
      taskId: 'task-1',
      submissionId: 'submission-1',
    });

    expect(submissionMocks.findFirst.mock.calls[0][0].where).toEqual({
      id: 'submission-1',
      taskId: 'task-1',
      assignmentId: 'assignment-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
    });
  });

  it('performs no mutations or platform bypass calls', async () => {
    const { adapter, assignmentMocks, submissionMocks, platformBypass } =
      createAdapter();
    assignmentMocks.findMany.mockResolvedValue([]);
    assignmentMocks.count.mockResolvedValue(0);

    await adapter.listTasks({ context: contextFixture() });

    expect(assignmentMocks.create).not.toHaveBeenCalled();
    expect(assignmentMocks.update).not.toHaveBeenCalled();
    expect(assignmentMocks.delete).not.toHaveBeenCalled();
    expect(submissionMocks.create).not.toHaveBeenCalled();
    expect(submissionMocks.update).not.toHaveBeenCalled();
    expect(submissionMocks.delete).not.toHaveBeenCalled();
    expect(platformBypass).not.toHaveBeenCalled();
  });
});

function modelMocks() {
  return {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

function createAdapter(): {
  adapter: StudentTasksReadAdapter;
  assignmentMocks: ReturnType<typeof modelMocks>;
  submissionMocks: ReturnType<typeof modelMocks>;
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
    adapter: new StudentTasksReadAdapter(prisma),
    assignmentMocks,
    submissionMocks,
    platformBypass,
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
