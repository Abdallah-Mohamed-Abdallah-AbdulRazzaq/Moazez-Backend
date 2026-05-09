import {
  AttendanceSessionStatus,
  BehaviorPointLedgerEntryType,
  BehaviorRecordStatus,
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeScopeType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import { ParentProgressReadAdapter } from '../infrastructure/parent-progress-read.adapter';

describe('ParentProgressReadAdapter', () => {
  it('reads academic progress from visible grade assessments only', async () => {
    const {
      adapter,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      scopedGradeAssessmentMocks,
      scopedGradeItemMocks,
    } = createAdapter();
    scopedEnrollmentMocks.findFirstOrThrow.mockResolvedValue(
      enrollmentFixture(),
    );
    scopedTeacherSubjectAllocationMocks.findMany.mockResolvedValue([
      {
        subjectId: 'subject-1',
        subject: { nameEn: 'Math', nameAr: 'Math AR' },
      },
    ]);
    scopedGradeAssessmentMocks.findMany.mockResolvedValue([]);
    scopedGradeItemMocks.findMany.mockResolvedValue([]);

    await adapter.getAcademicProgress(childFixture());

    const query = scopedGradeAssessmentMocks.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({
      academicYearId: 'year-1',
      termId: 'term-1',
      subjectId: { in: ['subject-1'] },
      approvalStatus: {
        in: [
          GradeAssessmentApprovalStatus.PUBLISHED,
          GradeAssessmentApprovalStatus.APPROVED,
        ],
      },
      deliveryMode: {
        in: [
          GradeAssessmentDeliveryMode.SCORE_ONLY,
          GradeAssessmentDeliveryMode.QUESTION_BASED,
        ],
      },
      OR: expect.arrayContaining([
        { scopeType: GradeScopeType.CLASSROOM, scopeKey: 'classroom-1' },
      ]),
    });
    expect(query.where).not.toHaveProperty('schoolId');
  });

  it('keeps behavior ledger queries separate from XP ledger queries', async () => {
    const {
      adapter,
      scopedBehaviorRecordMocks,
      scopedBehaviorPointLedgerMocks,
      scopedAttendanceEntryMocks,
      scopedXpLedgerMocks,
    } = createAdapter();
    scopedBehaviorRecordMocks.groupBy.mockResolvedValue([]);
    scopedBehaviorPointLedgerMocks.aggregate.mockResolvedValue({
      _sum: { amount: 0 },
    });
    scopedAttendanceEntryMocks.groupBy.mockResolvedValue([]);

    await adapter.getBehaviorProgress(childFixture());

    expect(scopedBehaviorPointLedgerMocks.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentId: 'student-1',
          enrollmentId: 'enrollment-1',
          entryType: {
            in: [
              BehaviorPointLedgerEntryType.AWARD,
              BehaviorPointLedgerEntryType.PENALTY,
              BehaviorPointLedgerEntryType.REVERSAL,
            ],
          },
          record: {
            status: BehaviorRecordStatus.APPROVED,
            deletedAt: null,
          },
        }),
      }),
    );
    expect(scopedXpLedgerMocks.aggregate).not.toHaveBeenCalled();
  });

  it('reads XP progress from XP ledger only', async () => {
    const { adapter, scopedXpLedgerMocks, scopedBehaviorPointLedgerMocks } =
      createAdapter();
    scopedXpLedgerMocks.aggregate.mockResolvedValue({ _sum: { amount: 25 } });
    scopedXpLedgerMocks.count.mockResolvedValue(1);
    scopedXpLedgerMocks.groupBy.mockResolvedValue([
      {
        sourceType: 'SYSTEM',
        _sum: { amount: 25 },
        _count: { _all: 1 },
      },
    ]);

    const result = await adapter.getXpProgress(childFixture());

    expect(result.totalXp).toBe(25);
    expect(scopedXpLedgerMocks.aggregate.mock.calls[0][0].where).toMatchObject({
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      academicYearId: 'year-1',
      termId: 'term-1',
    });
    expect(scopedBehaviorPointLedgerMocks.aggregate).not.toHaveBeenCalled();
  });

  it('performs no mutations or platform bypass calls', async () => {
    const {
      adapter,
      scopedEnrollmentMocks,
      scopedTeacherSubjectAllocationMocks,
      mutationMocks,
      platformBypass,
    } = createAdapter();
    scopedEnrollmentMocks.findFirstOrThrow.mockResolvedValue(
      enrollmentFixture(),
    );
    scopedTeacherSubjectAllocationMocks.findMany.mockResolvedValue([]);

    await adapter.getAcademicProgress(childFixture());

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

function enrollmentFixture() {
  return {
    id: 'enrollment-1',
    schoolId: 'school-1',
    classroom: {
      id: 'classroom-1',
      section: {
        id: 'section-1',
        grade: {
          id: 'grade-1',
          stage: { id: 'stage-1' },
        },
      },
    },
  };
}

function modelMocks(): {
  findFirstOrThrow: jest.Mock;
  findMany: jest.Mock;
  groupBy: jest.Mock;
  aggregate: jest.Mock;
  count: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
} {
  return {
    findFirstOrThrow: jest.fn(),
    findMany: jest.fn(),
    groupBy: jest.fn(),
    aggregate: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
}

function createAdapter(): {
  adapter: ParentProgressReadAdapter;
  scopedEnrollmentMocks: ReturnType<typeof modelMocks>;
  scopedTeacherSubjectAllocationMocks: ReturnType<typeof modelMocks>;
  scopedGradeAssessmentMocks: ReturnType<typeof modelMocks>;
  scopedGradeItemMocks: ReturnType<typeof modelMocks>;
  scopedBehaviorRecordMocks: ReturnType<typeof modelMocks>;
  scopedBehaviorPointLedgerMocks: ReturnType<typeof modelMocks>;
  scopedAttendanceEntryMocks: ReturnType<typeof modelMocks>;
  scopedXpLedgerMocks: ReturnType<typeof modelMocks>;
  mutationMocks: Record<string, jest.Mock>;
  platformBypass: jest.Mock;
} {
  const scopedEnrollmentMocks = modelMocks();
  const scopedTeacherSubjectAllocationMocks = modelMocks();
  const scopedGradeAssessmentMocks = modelMocks();
  const scopedGradeItemMocks = modelMocks();
  const scopedBehaviorRecordMocks = modelMocks();
  const scopedBehaviorPointLedgerMocks = modelMocks();
  const scopedAttendanceEntryMocks = modelMocks();
  const scopedXpLedgerMocks = modelMocks();
  const platformBypass = jest.fn();
  const prisma = {
    platformBypass,
    scoped: {
      enrollment: scopedEnrollmentMocks,
      teacherSubjectAllocation: scopedTeacherSubjectAllocationMocks,
      gradeAssessment: scopedGradeAssessmentMocks,
      gradeItem: scopedGradeItemMocks,
      behaviorRecord: scopedBehaviorRecordMocks,
      behaviorPointLedger: scopedBehaviorPointLedgerMocks,
      attendanceEntry: scopedAttendanceEntryMocks,
      xpLedger: scopedXpLedgerMocks,
    },
  } as unknown as PrismaService;

  return {
    adapter: new ParentProgressReadAdapter(prisma),
    scopedEnrollmentMocks,
    scopedTeacherSubjectAllocationMocks,
    scopedGradeAssessmentMocks,
    scopedGradeItemMocks,
    scopedBehaviorRecordMocks,
    scopedBehaviorPointLedgerMocks,
    scopedAttendanceEntryMocks,
    scopedXpLedgerMocks,
    mutationMocks: {
      enrollmentCreate: scopedEnrollmentMocks.create,
      assessmentCreate: scopedGradeAssessmentMocks.create,
      gradeItemCreate: scopedGradeItemMocks.create,
      behaviorCreate: scopedBehaviorRecordMocks.create,
      behaviorLedgerCreate: scopedBehaviorPointLedgerMocks.create,
      xpLedgerCreate: scopedXpLedgerMocks.create,
    },
    platformBypass,
  };
}
