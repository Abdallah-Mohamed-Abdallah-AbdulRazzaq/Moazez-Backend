import {
  ReinforcementSource,
  ReinforcementTaskStatus,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import { TeacherTasksReadAdapter } from '../infrastructure/teacher-tasks-read.adapter';

describe('TeacherTasksReadAdapter', () => {
  it('uses scoped Prisma to list visible teacher-authored tasks without hand-crafted schoolId', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.reinforcementTask.findMany.mockResolvedValue([]);
    prismaMocks.reinforcementTask.count.mockResolvedValue(0);

    await adapter.listTasks({
      teacherUserId: 'teacher-1',
      allocations: [allocationFixture()],
      filters: {
        status: ReinforcementTaskStatus.UNDER_REVIEW,
        source: ReinforcementSource.TEACHER,
        studentId: 'student-1',
        search: 'kindness',
        page: 2,
        limit: 10,
      },
    });

    const query = prismaMocks.reinforcementTask.findMany.mock.calls[0][0];
    const whereJson = JSON.stringify(query.where);

    expect(query.take).toBe(10);
    expect(query.skip).toBe(10);
    expect(query.where).toMatchObject({
      source: ReinforcementSource.TEACHER,
      status: ReinforcementTaskStatus.UNDER_REVIEW,
      OR: [{ assignedById: 'teacher-1' }, { createdById: 'teacher-1' }],
    });
    expect(whereJson).toContain('classroom-1');
    expect(whereJson).toContain('subject-1');
    expect(whereJson).toContain('term-1');
    expect(whereJson).toContain('student-1');
    expect(whereJson).toContain('kindness');
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('returns an empty list for non-teacher source filters', async () => {
    const { adapter, prismaMocks } = createAdapter();

    const result = await adapter.listTasks({
      teacherUserId: 'teacher-1',
      allocations: [allocationFixture()],
      filters: { source: ReinforcementSource.PARENT },
    });

    expect(result).toEqual({ items: [], total: 0, page: 1, limit: 20 });
    expect(prismaMocks.reinforcementTask.findMany).not.toHaveBeenCalled();
    expect(prismaMocks.reinforcementTask.count).not.toHaveBeenCalled();
  });

  it('lists owned students through active enrollment and allocation scope only', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.enrollment.findMany.mockResolvedValue([
      {
        id: 'enrollment-1',
        studentId: 'student-1',
        academicYearId: 'year-1',
        termId: 'term-1',
        classroomId: 'classroom-1',
        student: {
          id: 'student-1',
          firstName: 'Mona',
          lastName: 'Ahmed',
          status: StudentStatus.ACTIVE,
        },
      },
    ]);

    const result = await adapter.listOwnedStudents([allocationFixture()]);

    const query = prismaMocks.enrollment.findMany.mock.calls[0][0];
    expect(result).toEqual([
      {
        studentId: 'student-1',
        firstName: 'Mona',
        lastName: 'Ahmed',
        classIds: ['allocation-1'],
      },
    ]);
    expect(query.where).toMatchObject({
      OR: [
        expect.objectContaining({
          academicYearId: 'year-1',
          termId: 'term-1',
          classroomId: 'classroom-1',
          status: StudentEnrollmentStatus.ACTIVE,
          student: {
            is: {
              status: StudentStatus.ACTIVE,
              deletedAt: null,
            },
          },
        }),
      ],
    });
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('selects safe proof file metadata and does not select raw storage internals', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.reinforcementTask.findFirst.mockResolvedValue(null);

    await adapter.findVisibleTaskById({
      teacherUserId: 'teacher-1',
      allocations: [allocationFixture()],
      taskId: 'task-1',
    });

    const query = prismaMocks.reinforcementTask.findFirst.mock.calls[0][0];
    const selectJson = JSON.stringify(query.select);

    expect(selectJson).toContain('proofFile');
    expect(selectJson).toContain('originalName');
    expect(selectJson).toContain('mimeType');
    expect(selectJson).not.toContain('bucket');
    expect(selectJson).not.toContain('objectKey');
    expect(selectJson).not.toContain('metadata');
  });

  it('remains read-only and does not touch XP or behavior points', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.reinforcementTask.findMany.mockResolvedValue([]);
    prismaMocks.reinforcementTask.count.mockResolvedValue(0);
    prismaMocks.reinforcementTask.findFirst.mockResolvedValue(null);
    prismaMocks.enrollment.findMany.mockResolvedValue([]);

    await adapter.listOwnedStudents([allocationFixture()]);
    await adapter.listTasks({
      teacherUserId: 'teacher-1',
      allocations: [allocationFixture()],
    });
    await adapter.findVisibleTaskById({
      teacherUserId: 'teacher-1',
      allocations: [allocationFixture()],
      taskId: 'task-1',
    });

    expect(prismaMocks.reinforcementTask.create).not.toHaveBeenCalled();
    expect(prismaMocks.reinforcementTask.update).not.toHaveBeenCalled();
    expect(prismaMocks.reinforcementTask.delete).not.toHaveBeenCalled();
    expect(prismaMocks.xpLedger.findMany).not.toHaveBeenCalled();
    expect(prismaMocks.xpLedger.create).not.toHaveBeenCalled();
    expect(prismaMocks.behaviorPointLedger.findMany).not.toHaveBeenCalled();
  });
});

function createAdapter(): {
  adapter: TeacherTasksReadAdapter;
  prismaMocks: {
    reinforcementTask: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    enrollment: {
      findMany: jest.Mock;
    };
    xpLedger: {
      findMany: jest.Mock;
      create: jest.Mock;
    };
    behaviorPointLedger: {
      findMany: jest.Mock;
    };
  };
} {
  const prismaMocks = {
    reinforcementTask: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    enrollment: {
      findMany: jest.fn(),
    },
    xpLedger: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    behaviorPointLedger: {
      findMany: jest.fn(),
    },
  };
  const prisma = {
    scoped: prismaMocks,
  } as unknown as PrismaService;

  return {
    adapter: new TeacherTasksReadAdapter(prisma),
    prismaMocks,
  };
}

function allocationFixture(
  overrides?: Partial<TeacherAppAllocationRecord>,
): TeacherAppAllocationRecord {
  const schoolId = 'school-1';

  return {
    id: 'allocation-1',
    schoolId,
    teacherUserId: 'teacher-1',
    subjectId: 'subject-1',
    classroomId: 'classroom-1',
    termId: 'term-1',
    subject: {
      id: 'subject-1',
      schoolId,
      nameAr: 'Math AR',
      nameEn: 'Math',
      code: 'MATH',
    },
    classroom: {
      id: 'classroom-1',
      schoolId,
      sectionId: 'section-1',
      roomId: null,
      nameAr: 'Classroom AR',
      nameEn: 'Classroom',
      room: null,
      section: {
        id: 'section-1',
        schoolId,
        gradeId: 'grade-1',
        nameAr: 'Section AR',
        nameEn: 'Section',
        grade: {
          id: 'grade-1',
          schoolId,
          stageId: 'stage-1',
          nameAr: 'Grade AR',
          nameEn: 'Grade',
          stage: {
            id: 'stage-1',
            schoolId,
            nameAr: 'Stage AR',
            nameEn: 'Stage',
          },
        },
      },
    },
    term: {
      id: 'term-1',
      schoolId,
      academicYearId: 'year-1',
      nameAr: 'Term AR',
      nameEn: 'Term',
      isActive: true,
    },
    ...overrides,
  };
}
