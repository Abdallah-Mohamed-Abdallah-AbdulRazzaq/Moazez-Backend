import {
  HomeworkAssignmentMode,
  HomeworkAssignmentStatus,
  HomeworkTargetStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';
import { StudentHomeworksReadAdapter } from '../infrastructure/student-homeworks-read.adapter';

describe('StudentHomeworksReadAdapter', () => {
  it('lists only current student target rows and visible assignment statuses', async () => {
    const { adapter, targetMocks } = createAdapter();
    targetMocks.findMany.mockResolvedValue([]);
    targetMocks.count.mockResolvedValue(0);

    await adapter.listHomeworks({
      context: contextFixture(),
      query: { mode: 'worksheet', search: 'fractions' },
    });

    const query = targetMocks.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      homeworkAssignment: {
        is: {
          AND: expect.arrayContaining([
            expect.objectContaining({
              deletedAt: null,
              academicYearId: 'year-1',
              classroomId: 'classroom-1',
              termId: 'term-1',
              status: {
                in: [
                  HomeworkAssignmentStatus.PUBLISHED,
                  HomeworkAssignmentStatus.CLOSED,
                ],
              },
            }),
            { mode: HomeworkAssignmentMode.WORKSHEET },
          ]),
        },
      },
    });
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('filters waiting and not-completed through target status plus assignment visibility', async () => {
    const { adapter, targetMocks } = createAdapter();
    targetMocks.findMany.mockResolvedValue([]);
    targetMocks.count.mockResolvedValue(0);

    await adapter.listHomeworks({
      context: contextFixture(),
      query: { status: 'waiting' },
    });

    const waitingWhere = targetMocks.findMany.mock.calls[0][0].where;
    expect(waitingWhere.status).toEqual({
      in: [HomeworkTargetStatus.ASSIGNED, HomeworkTargetStatus.VIEWED],
    });
    expect(waitingWhere.homeworkAssignment.is.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: {
            in: [
              HomeworkAssignmentStatus.PUBLISHED,
              HomeworkAssignmentStatus.CLOSED,
            ],
          },
        }),
        expect.objectContaining({
          status: HomeworkAssignmentStatus.PUBLISHED,
          dueAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      ]),
    );

    await adapter.listHomeworks({
      context: contextFixture(),
      query: { status: 'not_completed' },
    });

    const notCompletedWhere = targetMocks.findMany.mock.calls[1][0].where;
    expect(notCompletedWhere.OR).toHaveLength(2);
    expect(JSON.stringify(notCompletedWhere.OR)).toContain('PUBLISHED');
    expect(JSON.stringify(notCompletedWhere.OR)).toContain('CLOSED');
  });

  it('reads detail only through the current student target boundary', async () => {
    const { adapter, targetMocks } = createAdapter();
    targetMocks.findFirst.mockResolvedValue(null);

    await adapter.findHomework({
      context: contextFixture(),
      homeworkId: 'homework-1',
    });

    const query = targetMocks.findFirst.mock.calls[0][0];
    expect(query.where).toMatchObject({
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      homeworkAssignmentId: 'homework-1',
    });
    expect(query.where.homeworkAssignment.is.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: {
            in: [
              HomeworkAssignmentStatus.PUBLISHED,
              HomeworkAssignmentStatus.CLOSED,
            ],
          },
        }),
      ]),
    );
  });

  it('performs no mutations or platform bypass calls', async () => {
    const { adapter, targetMocks, assignmentMocks, platformBypass } =
      createAdapter();
    targetMocks.findMany.mockResolvedValue([]);
    targetMocks.count.mockResolvedValue(0);

    await adapter.listHomeworks({ context: contextFixture() });

    expect(targetMocks.create).not.toHaveBeenCalled();
    expect(targetMocks.update).not.toHaveBeenCalled();
    expect(targetMocks.delete).not.toHaveBeenCalled();
    expect(assignmentMocks.create).not.toHaveBeenCalled();
    expect(assignmentMocks.update).not.toHaveBeenCalled();
    expect(assignmentMocks.delete).not.toHaveBeenCalled();
    expect(platformBypass).not.toHaveBeenCalled();
  });
});

function modelMocks() {
  return {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

function createAdapter(): {
  adapter: StudentHomeworksReadAdapter;
  targetMocks: ReturnType<typeof modelMocks>;
  assignmentMocks: ReturnType<typeof modelMocks>;
  platformBypass: jest.Mock;
} {
  const targetMocks = modelMocks();
  const assignmentMocks = modelMocks();
  const platformBypass = jest.fn();
  const prisma = {
    platformBypass,
    scoped: {
      homeworkTarget: targetMocks,
      homeworkAssignment: assignmentMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new StudentHomeworksReadAdapter(prisma),
    targetMocks,
    assignmentMocks,
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
