import { UserType } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { TeacherAppAllocationReadAdapter } from '../teacher-app-allocation-read.adapter';

describe('TeacherAppAllocationReadAdapter', () => {
  it('finds owned allocations through scoped Prisma without hand-crafted schoolId', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.findFirst.mockResolvedValue(null);

    await adapter.findOwnedAllocationById({
      allocationId: 'allocation-1',
      teacherUserId: 'teacher-1',
    });

    const query = prismaMocks.findFirst.mock.calls[0][0];
    expect(prismaMocks.findFirst).toHaveBeenCalledTimes(1);
    expect(query.where).toMatchObject({
      id: 'allocation-1',
      teacherUserId: 'teacher-1',
      teacherUser: {
        is: {
          userType: UserType.TEACHER,
          deletedAt: null,
        },
      },
    });
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('lists owned allocation ids using read-only scoped queries', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.findMany.mockResolvedValue([
      { id: 'allocation-2' },
      { id: 'allocation-1' },
    ]);

    const result = await adapter.listOwnedAllocationIds('teacher-1');

    expect(result).toEqual(['allocation-2', 'allocation-1']);
    const query = prismaMocks.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({ teacherUserId: 'teacher-1' });
    expect(query.where).not.toHaveProperty('schoolId');
    expect(query.select).toEqual({ id: true });
    expect(query.orderBy).toEqual([{ createdAt: 'desc' }]);
  });

  it('does not perform mutations', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.findFirst.mockResolvedValue(null);
    prismaMocks.findMany.mockResolvedValue([]);

    await adapter.findOwnedAllocationById({
      allocationId: 'allocation-1',
      teacherUserId: 'teacher-1',
    });
    await adapter.listOwnedAllocationIds('teacher-1');

    expect(prismaMocks.create).not.toHaveBeenCalled();
    expect(prismaMocks.update).not.toHaveBeenCalled();
    expect(prismaMocks.updateMany).not.toHaveBeenCalled();
    expect(prismaMocks.delete).not.toHaveBeenCalled();
    expect(prismaMocks.deleteMany).not.toHaveBeenCalled();
  });
});

function createAdapter(): {
  adapter: TeacherAppAllocationReadAdapter;
  prismaMocks: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
} {
  const prismaMocks = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };

  const prisma = {
    scoped: {
      teacherSubjectAllocation: prismaMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new TeacherAppAllocationReadAdapter(prisma),
    prismaMocks,
  };
}
