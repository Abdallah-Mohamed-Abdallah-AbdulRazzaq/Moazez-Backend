import { StudentStatus } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type {
  ParentAppAccessibleChild,
  ParentAppContext,
} from '../../shared/parent-app.types';
import { ParentChildrenReadAdapter } from '../infrastructure/parent-children-read.adapter';

describe('ParentChildrenReadAdapter', () => {
  it('lists current-school children through scoped Prisma without hand-crafted schoolId', async () => {
    const { adapter, scopedEnrollmentMocks } = createAdapter();
    scopedEnrollmentMocks.findMany.mockResolvedValue([]);

    await adapter.listChildren(contextFixture());

    const query = scopedEnrollmentMocks.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      id: { in: ['enrollment-1', 'enrollment-2'] },
      studentId: { in: ['student-1', 'student-2'] },
      student: {
        is: {
          status: StudentStatus.ACTIVE,
          deletedAt: null,
        },
      },
    });
    expect(query.where).not.toHaveProperty('schoolId');
    expect(
      query.select.classroom.select.section.select.grade.select.stage,
    ).toBeDefined();
  });

  it('finds an owned child detail through scoped Prisma', async () => {
    const { adapter, scopedEnrollmentMocks } = createAdapter();
    scopedEnrollmentMocks.findFirst.mockResolvedValue(null);

    await adapter.findChild(accessibleChild());

    const query = scopedEnrollmentMocks.findFirst.mock.calls[0][0];
    expect(query.where).toMatchObject({
      id: 'enrollment-1',
      studentId: 'student-1',
      academicYearId: 'year-1',
      student: {
        is: {
          status: StudentStatus.ACTIVE,
          deletedAt: null,
        },
      },
    });
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('performs no mutations or platform bypass calls', async () => {
    const { adapter, scopedEnrollmentMocks, mutationMocks, platformBypass } =
      createAdapter();
    scopedEnrollmentMocks.findMany.mockResolvedValue([]);
    scopedEnrollmentMocks.findFirst.mockResolvedValue(null);

    await adapter.listChildren(contextFixture());
    await adapter.findChild(accessibleChild());

    for (const mutation of Object.values(mutationMocks)) {
      expect(mutation).not.toHaveBeenCalled();
    }
    expect(platformBypass).not.toHaveBeenCalled();
  });
});

function contextFixture(): ParentAppContext {
  return {
    parentUserId: 'parent-user-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: ['students.records.view'],
    guardianIds: ['guardian-1'],
    children: [
      accessibleChild(),
      accessibleChild({
        studentId: 'student-2',
        enrollmentId: 'enrollment-2',
        classroomId: 'classroom-2',
        termId: null,
      }),
    ],
  };
}

function accessibleChild(
  overrides?: Partial<ParentAppAccessibleChild>,
): ParentAppAccessibleChild {
  return {
    studentId: 'student-1',
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    ...overrides,
  };
}

function modelMocks(): {
  findFirst: jest.Mock;
  findMany: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
} {
  return {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
}

function createAdapter(): {
  adapter: ParentChildrenReadAdapter;
  scopedEnrollmentMocks: ReturnType<typeof modelMocks>;
  mutationMocks: Record<string, jest.Mock>;
  platformBypass: jest.Mock;
} {
  const scopedEnrollmentMocks = modelMocks();
  const platformBypass = jest.fn();

  const prisma = {
    platformBypass,
    scoped: {
      enrollment: scopedEnrollmentMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new ParentChildrenReadAdapter(prisma),
    scopedEnrollmentMocks,
    mutationMocks: {
      enrollmentCreate: scopedEnrollmentMocks.create,
      enrollmentUpdate: scopedEnrollmentMocks.update,
      enrollmentUpdateMany: scopedEnrollmentMocks.updateMany,
      enrollmentDelete: scopedEnrollmentMocks.delete,
      enrollmentDeleteMany: scopedEnrollmentMocks.deleteMany,
    },
    platformBypass,
  };
}
