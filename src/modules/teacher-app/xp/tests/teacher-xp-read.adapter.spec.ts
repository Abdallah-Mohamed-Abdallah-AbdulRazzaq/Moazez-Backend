import {
  StudentEnrollmentStatus,
  StudentStatus,
  XpSourceType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { TeacherAppAllocationRecord } from '../../shared/teacher-app.types';
import {
  TeacherXpOwnedEnrollmentRecord,
  TeacherXpReadAdapter,
} from '../infrastructure/teacher-xp-read.adapter';

describe('TeacherXpReadAdapter', () => {
  it('lists owned active enrollments through allocation scope without hand-crafted schoolId', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.enrollment.findMany.mockResolvedValue([]);

    await adapter.listOwnedEnrollments({
      allocations: [allocationFixture()],
      studentId: 'student-1',
    });

    const query = prismaMocks.enrollment.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      studentId: 'student-1',
      OR: [
        expect.objectContaining({
          academicYearId: 'year-1',
          termId: 'term-1',
          classroomId: 'classroom-1',
          status: StudentEnrollmentStatus.ACTIVE,
          deletedAt: null,
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

  it('returns empty enrollment results without querying Prisma when no allocations are owned', async () => {
    const { adapter, prismaMocks } = createAdapter();

    await expect(
      adapter.listOwnedEnrollments({ allocations: [] }),
    ).resolves.toEqual([]);
    await expect(
      adapter.studentBelongsToAllocations({
        allocations: [],
        studentId: 'student-1',
      }),
    ).resolves.toBe(false);

    expect(prismaMocks.enrollment.findMany).not.toHaveBeenCalled();
    expect(prismaMocks.enrollment.count).not.toHaveBeenCalled();
  });

  it('reads XP ledger entries only for owned enrollments and nullable enrollment rows', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.xpLedger.findMany.mockResolvedValue([]);
    prismaMocks.xpLedger.count.mockResolvedValue(0);

    await adapter.listLedger({
      ownedEnrollments: [ownedEnrollmentFixture()],
      filters: {
        studentId: 'student-1',
        sourceType: XpSourceType.REINFORCEMENT_TASK,
        search: 'approved',
        page: 2,
        limit: 10,
      },
    });

    const query = prismaMocks.xpLedger.findMany.mock.calls[0][0];
    const whereJson = JSON.stringify(query.where);

    expect(query.take).toBe(10);
    expect(query.skip).toBe(10);
    expect(query.where).toMatchObject({
      studentId: { in: ['student-1'] },
      sourceType: XpSourceType.REINFORCEMENT_TASK,
    });
    expect(whereJson).toContain('enrollment-1');
    expect(whereJson).toContain('year-1');
    expect(whereJson).toContain('term-1');
    expect(whereJson).toContain('approved');
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('uses XP ledger reads only and never touches Behavior points or XP mutations', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.enrollment.findMany.mockResolvedValue([]);
    prismaMocks.enrollment.count.mockResolvedValue(0);
    prismaMocks.xpLedger.findMany.mockResolvedValue([]);
    prismaMocks.xpLedger.count.mockResolvedValue(0);

    await adapter.listOwnedEnrollments({ allocations: [allocationFixture()] });
    await adapter.studentBelongsToAllocations({
      allocations: [allocationFixture()],
      studentId: 'student-1',
    });
    await adapter.listAllLedger({
      ownedEnrollments: [ownedEnrollmentFixture()],
    });
    await adapter.listLedger({
      ownedEnrollments: [ownedEnrollmentFixture()],
    });

    expect(prismaMocks.xpLedger.findMany).toHaveBeenCalled();
    expect(prismaMocks.xpLedger.create).not.toHaveBeenCalled();
    expect(prismaMocks.xpLedger.update).not.toHaveBeenCalled();
    expect(prismaMocks.xpLedger.delete).not.toHaveBeenCalled();
    expect(prismaMocks.behaviorPointLedger.findMany).not.toHaveBeenCalled();
    expect(prismaMocks.behaviorPointLedger.create).not.toHaveBeenCalled();
  });
});

function createAdapter(): {
  adapter: TeacherXpReadAdapter;
  prismaMocks: {
    enrollment: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
    xpLedger: {
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    behaviorPointLedger: {
      findMany: jest.Mock;
      create: jest.Mock;
    };
  };
} {
  const prismaMocks = {
    enrollment: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    xpLedger: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    behaviorPointLedger: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };
  const prisma = {
    scoped: prismaMocks,
  } as unknown as PrismaService;

  return {
    adapter: new TeacherXpReadAdapter(prisma),
    prismaMocks,
  };
}

function allocationFixture(): TeacherAppAllocationRecord {
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
  };
}

function ownedEnrollmentFixture(): TeacherXpOwnedEnrollmentRecord {
  return {
    id: 'enrollment-1',
    studentId: 'student-1',
    academicYearId: 'year-1',
    termId: 'term-1',
    classroomId: 'classroom-1',
    status: StudentEnrollmentStatus.ACTIVE,
    student: {
      id: 'student-1',
      firstName: 'Mona',
      lastName: 'Ahmed',
      status: StudentStatus.ACTIVE,
    },
    classroom: {
      id: 'classroom-1',
      nameAr: 'Classroom AR',
      nameEn: 'Classroom',
      section: {
        id: 'section-1',
        nameAr: 'Section AR',
        nameEn: 'Section',
        grade: {
          id: 'grade-1',
          nameAr: 'Grade AR',
          nameEn: 'Grade',
          stage: {
            id: 'stage-1',
            nameAr: 'Stage AR',
            nameEn: 'Stage',
          },
        },
      },
    },
  } as TeacherXpOwnedEnrollmentRecord;
}
