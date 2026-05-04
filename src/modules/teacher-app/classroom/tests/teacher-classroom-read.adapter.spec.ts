import { StudentEnrollmentStatus, StudentStatus } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { TeacherClassroomReadAdapter } from '../infrastructure/teacher-classroom-read.adapter';

describe('TeacherClassroomReadAdapter', () => {
  it('counts active classroom students through scoped Prisma without schoolId', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.enrollment.count.mockResolvedValue(2);

    await expect(
      adapter.countActiveStudentsInClassroom('classroom-1'),
    ).resolves.toBe(2);

    const query = prismaMocks.enrollment.count.mock.calls[0][0];
    expect(query.where).toMatchObject({
      classroomId: 'classroom-1',
      status: StudentEnrollmentStatus.ACTIVE,
      deletedAt: null,
      student: {
        is: {
          status: StudentStatus.ACTIVE,
          deletedAt: null,
        },
      },
    });
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('lists active roster rows for one classroom with search and pagination', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.enrollment.findMany.mockResolvedValue([
      {
        student: {
          id: 'student-1',
          firstName: 'Mona',
          lastName: 'Ahmed',
          status: StudentStatus.ACTIVE,
        },
      },
    ]);
    prismaMocks.enrollment.count.mockResolvedValue(1);

    const result = await adapter.listActiveRoster({
      classroomId: 'classroom-1',
      filters: { search: 'Mona', page: 2, limit: 10 },
    });

    const query = prismaMocks.enrollment.findMany.mock.calls[0][0];
    const whereJson = JSON.stringify(query.where);

    expect(result).toEqual({
      items: [
        {
          id: 'student-1',
          firstName: 'Mona',
          lastName: 'Ahmed',
          status: StudentStatus.ACTIVE,
        },
      ],
      page: 2,
      limit: 10,
      total: 1,
    });
    expect(query.take).toBe(10);
    expect(query.skip).toBe(10);
    expect(whereJson).toContain('classroom-1');
    expect(whereJson).toContain('Mona');
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('does not expose private relations or call mutations', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.enrollment.findMany.mockResolvedValue([]);
    prismaMocks.enrollment.count.mockResolvedValue(0);

    await adapter.countActiveStudentsInClassroom('classroom-1');
    await adapter.listActiveRoster({ classroomId: 'classroom-1' });

    const query = prismaMocks.enrollment.findMany.mock.calls[0][0];
    expect(query.select).toEqual({
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
        },
      },
    });
    expect(prismaMocks.enrollment.create).not.toHaveBeenCalled();
    expect(prismaMocks.enrollment.update).not.toHaveBeenCalled();
    expect(prismaMocks.enrollment.delete).not.toHaveBeenCalled();
  });
});

function createAdapter(): {
  adapter: TeacherClassroomReadAdapter;
  prismaMocks: {
    enrollment: {
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
} {
  const prismaMocks = {
    enrollment: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const prisma = {
    scoped: prismaMocks,
  } as unknown as PrismaService;

  return {
    adapter: new TeacherClassroomReadAdapter(prisma),
    prismaMocks,
  };
}
