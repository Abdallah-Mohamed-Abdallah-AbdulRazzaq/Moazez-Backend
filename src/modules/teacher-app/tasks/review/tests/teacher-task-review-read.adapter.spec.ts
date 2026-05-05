import {
  ReinforcementSubmissionStatus,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import type { TeacherAppAllocationRecord } from '../../../shared/teacher-app.types';
import { TeacherTaskReviewReadAdapter } from '../infrastructure/teacher-task-review-read.adapter';

describe('TeacherTaskReviewReadAdapter', () => {
  it('uses scoped Prisma to list teacher-owned review submissions without hand-crafted schoolId', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.reinforcementSubmission.findMany.mockResolvedValue([]);
    prismaMocks.reinforcementSubmission.count.mockResolvedValue(0);

    await adapter.listReviewQueue({
      teacherUserId: 'teacher-1',
      allocations: [allocationFixture()],
      filters: {
        status: ReinforcementSubmissionStatus.SUBMITTED,
        studentId: 'student-1',
        search: 'proof',
        page: 2,
        limit: 10,
      },
    });

    const query = prismaMocks.reinforcementSubmission.findMany.mock.calls[0][0];
    const whereJson = JSON.stringify(query.where);

    expect(query.take).toBe(10);
    expect(query.skip).toBe(10);
    expect(query.where).toMatchObject({
      status: ReinforcementSubmissionStatus.SUBMITTED,
      studentId: 'student-1',
      task: expect.objectContaining({
        OR: [{ assignedById: 'teacher-1' }, { createdById: 'teacher-1' }],
      }),
    });
    expect(whereJson).toContain('classroom-1');
    expect(whereJson).toContain('subject-1');
    expect(whereJson).toContain('term-1');
    expect(whereJson).toContain('proof');
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('validates student ownership through active enrollment and allocation scope', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.enrollment.count.mockResolvedValue(1);

    await expect(
      adapter.studentBelongsToAllocations({
        allocations: [allocationFixture()],
        studentId: 'student-1',
      }),
    ).resolves.toBe(true);

    const query = prismaMocks.enrollment.count.mock.calls[0][0];
    expect(query.where).toMatchObject({
      studentId: 'student-1',
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

  it('selects safe proof file metadata and omits raw storage internals', async () => {
    const { adapter, prismaMocks } = createAdapter();
    prismaMocks.reinforcementSubmission.findFirst.mockResolvedValue(null);

    await adapter.findVisibleSubmissionById({
      teacherUserId: 'teacher-1',
      allocations: [allocationFixture()],
      submissionId: 'submission-1',
    });

    const query =
      prismaMocks.reinforcementSubmission.findFirst.mock.calls[0][0];
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
    prismaMocks.reinforcementSubmission.findMany.mockResolvedValue([]);
    prismaMocks.reinforcementSubmission.count.mockResolvedValue(0);
    prismaMocks.reinforcementSubmission.findFirst.mockResolvedValue(null);
    prismaMocks.enrollment.count.mockResolvedValue(0);

    await adapter.listReviewQueue({
      teacherUserId: 'teacher-1',
      allocations: [allocationFixture()],
    });
    await adapter.findVisibleSubmissionById({
      teacherUserId: 'teacher-1',
      allocations: [allocationFixture()],
      submissionId: 'submission-1',
    });
    await adapter.studentBelongsToAllocations({
      allocations: [allocationFixture()],
      studentId: 'student-1',
    });

    expect(prismaMocks.reinforcementSubmission.create).not.toHaveBeenCalled();
    expect(prismaMocks.reinforcementSubmission.update).not.toHaveBeenCalled();
    expect(prismaMocks.reinforcementSubmission.delete).not.toHaveBeenCalled();
    expect(prismaMocks.xpLedger.findMany).not.toHaveBeenCalled();
    expect(prismaMocks.xpLedger.create).not.toHaveBeenCalled();
    expect(prismaMocks.behaviorPointLedger.findMany).not.toHaveBeenCalled();
  });
});

function createAdapter(): {
  adapter: TeacherTaskReviewReadAdapter;
  prismaMocks: {
    reinforcementSubmission: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    enrollment: {
      count: jest.Mock;
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
    reinforcementSubmission: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    enrollment: {
      count: jest.fn(),
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
    adapter: new TeacherTaskReviewReadAdapter(prisma),
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
