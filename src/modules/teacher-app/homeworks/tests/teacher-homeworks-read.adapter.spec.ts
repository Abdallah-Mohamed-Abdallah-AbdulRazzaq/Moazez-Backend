import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { TeacherHomeworksReadAdapter } from '../infrastructure/teacher-homeworks-read.adapter';

describe('TeacherHomeworksReadAdapter', () => {
  it('checks homework ownership through teacher and allocation without hand-crafted schoolId', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.homeworkAssignment.findFirst.mockResolvedValue({
      id: 'homework-1',
    });

    const result = await adapter.findOwnedAssignmentBoundary({
      teacherUserId: 'teacher-1',
      classId: 'allocation-1',
      homeworkId: 'homework-1',
    });

    expect(result).toEqual({ id: 'homework-1' });
    const query = prismaMocks.homeworkAssignment.findFirst.mock.calls[0][0];
    expect(query.where).toMatchObject({
      id: 'homework-1',
      teacherUserId: 'teacher-1',
      teacherSubjectAllocationId: 'allocation-1',
      deletedAt: null,
    });
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('lists dashboard assignments only for owned allocation ids', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.homeworkAssignment.findMany.mockResolvedValue([]);

    await adapter.listDashboardAssignments({
      teacherUserId: 'teacher-1',
      allocationIds: ['allocation-1', 'allocation-2'],
    });

    const query = prismaMocks.homeworkAssignment.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      teacherUserId: 'teacher-1',
      teacherSubjectAllocationId: { in: ['allocation-1', 'allocation-2'] },
      deletedAt: null,
    });
    expect(query.where).not.toHaveProperty('schoolId');
    expect(query.select.targets.select).toEqual({ status: true });
  });

  it('does not query assignments when the teacher has no allocations', async () => {
    const { adapter, prismaMocks } = createAdapter();

    const result = await adapter.listDashboardAssignments({
      teacherUserId: 'teacher-1',
      allocationIds: [],
    });

    expect(result).toEqual([]);
    expect(prismaMocks.homeworkAssignment.findMany).not.toHaveBeenCalled();
  });

  it('loads academic year references through scoped Prisma without mutations', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.academicYear.findMany.mockResolvedValue([]);

    await adapter.listAcademicYearReferences(['year-1', 'year-1']);

    const query = prismaMocks.academicYear.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ id: { in: ['year-1'] }, deletedAt: null });
    expect(query.where).not.toHaveProperty('schoolId');
    expect(prismaMocks.homeworkAssignment.create).not.toHaveBeenCalled();
    expect(prismaMocks.homeworkAssignment.update).not.toHaveBeenCalled();
    expect(prismaMocks.homeworkAssignment.delete).not.toHaveBeenCalled();
  });
});

function createAdapter(): {
  adapter: TeacherHomeworksReadAdapter;
  prismaMocks: {
    homeworkAssignment: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    academicYear: {
      findMany: jest.Mock;
    };
  };
} {
  const prismaMocks = {
    homeworkAssignment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    academicYear: {
      findMany: jest.fn(),
    },
  };

  const prisma = {
    scoped: prismaMocks,
  } as unknown as PrismaService;

  return {
    adapter: new TeacherHomeworksReadAdapter(prisma),
    prismaMocks,
  };
}
