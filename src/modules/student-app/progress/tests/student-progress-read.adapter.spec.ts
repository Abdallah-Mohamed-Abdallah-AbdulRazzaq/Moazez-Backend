import {
  AttendanceSessionStatus,
  BehaviorPointLedgerEntryType,
  BehaviorRecordStatus,
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeItemStatus,
  GradeScopeType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';
import { StudentProgressReadAdapter } from '../infrastructure/student-progress-read.adapter';

describe('StudentProgressReadAdapter', () => {
  it('uses visible grades for the current student academic progress', async () => {
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
        subject: { id: 'subject-1', nameEn: 'Math', nameAr: 'Math AR' },
      },
    ]);
    scopedGradeAssessmentMocks.findMany.mockResolvedValue([
      {
        id: 'assessment-1',
        subjectId: 'subject-1',
        maxScore: 10,
        subject: { id: 'subject-1', nameEn: 'Math', nameAr: 'Math AR' },
      },
    ]);
    scopedGradeItemMocks.findMany.mockResolvedValue([
      {
        assessmentId: 'assessment-1',
        score: 8,
        status: GradeItemStatus.ENTERED,
      },
    ]);

    const result = await adapter.getAcademicProgress(contextFixture());

    expect(result).toMatchObject({
      totalEarned: 8,
      totalMax: 10,
      percentage: 80,
    });
    expect(
      scopedGradeAssessmentMocks.findMany.mock.calls[0][0].where,
    ).toMatchObject({
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
    expect(
      scopedGradeAssessmentMocks.findMany.mock.calls[0][0].where,
    ).not.toHaveProperty('schoolId');
    expect(scopedGradeItemMocks.findMany.mock.calls[0][0].where).toEqual({
      assessmentId: { in: ['assessment-1'] },
      studentId: 'student-1',
    });
  });

  it('keeps behavior point ledger separate from XP ledger', async () => {
    const {
      adapter,
      scopedBehaviorRecordMocks,
      scopedBehaviorPointLedgerMocks,
      scopedAttendanceEntryMocks,
      scopedXpLedgerMocks,
    } = createAdapter();
    scopedBehaviorRecordMocks.groupBy.mockResolvedValue([]);
    scopedBehaviorPointLedgerMocks.aggregate.mockResolvedValue({
      _sum: { amount: 3 },
    });
    scopedAttendanceEntryMocks.groupBy.mockResolvedValue([]);

    const behavior = await adapter.getBehaviorProgress(contextFixture());

    expect(behavior.totalBehaviorPoints).toBe(3);
    expect(
      scopedBehaviorPointLedgerMocks.aggregate.mock.calls[0][0].where,
    ).toMatchObject({
      studentId: 'student-1',
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
    });
    expect(scopedXpLedgerMocks.aggregate).not.toHaveBeenCalled();
  });

  it('reads XP only from XpLedger and performs no mutations', async () => {
    const { adapter, scopedXpLedgerMocks, mutationMocks, platformBypass } =
      createAdapter();
    scopedXpLedgerMocks.aggregate.mockResolvedValue({ _sum: { amount: 25 } });
    scopedXpLedgerMocks.count.mockResolvedValue(1);
    scopedXpLedgerMocks.groupBy.mockResolvedValue([
      { sourceType: 'SYSTEM', _count: { _all: 1 }, _sum: { amount: 25 } },
    ]);

    const xp = await adapter.getXpProgress(contextFixture());

    expect(xp).toEqual({
      totalXp: 25,
      entriesCount: 1,
      bySource: [{ sourceType: 'system', totalXp: 25, entriesCount: 1 }],
    });
    expect(scopedXpLedgerMocks.aggregate.mock.calls[0][0].where).toEqual({
      studentId: 'student-1',
      academicYearId: 'year-1',
      termId: 'term-1',
    });
    for (const mutation of Object.values(mutationMocks)) {
      expect(mutation).not.toHaveBeenCalled();
    }
    expect(platformBypass).not.toHaveBeenCalled();
  });

  it('reads attendance progress from submitted sessions only', async () => {
    const {
      adapter,
      scopedBehaviorRecordMocks,
      scopedBehaviorPointLedgerMocks,
      scopedAttendanceEntryMocks,
    } = createAdapter();
    scopedBehaviorRecordMocks.groupBy.mockResolvedValue([]);
    scopedBehaviorPointLedgerMocks.aggregate.mockResolvedValue({
      _sum: { amount: 0 },
    });
    scopedAttendanceEntryMocks.groupBy.mockResolvedValue([]);

    await adapter.getBehaviorProgress(contextFixture());

    expect(
      scopedAttendanceEntryMocks.groupBy.mock.calls[0][0].where,
    ).toMatchObject({
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      session: {
        academicYearId: 'year-1',
        termId: 'term-1',
        status: AttendanceSessionStatus.SUBMITTED,
        deletedAt: null,
      },
    });
  });
});

function contextFixture(): StudentAppContext {
  return {
    studentUserId: 'student-user-1',
    studentId: 'student-1',
    schoolId: 'school-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    roleId: 'role-1',
    permissions: ['students.records.view'],
    enrollmentId: 'enrollment-1',
    classroomId: 'classroom-1',
    academicYearId: 'year-1',
    requestedAcademicYearId: 'year-1',
    requestedTermId: 'term-1',
    termId: 'term-1',
  };
}

function enrollmentFixture() {
  return {
    id: 'enrollment-1',
    classroom: {
      id: 'classroom-1',
      section: {
        id: 'section-1',
        grade: {
          id: 'grade-1',
          stage: {
            id: 'stage-1',
          },
        },
      },
    },
  };
}

function modelMocks(): {
  findFirstOrThrow: jest.Mock;
  findMany: jest.Mock;
  count: jest.Mock;
  groupBy: jest.Mock;
  aggregate: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
} {
  return {
    findFirstOrThrow: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    aggregate: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
}

function createAdapter(): {
  adapter: StudentProgressReadAdapter;
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
    adapter: new StudentProgressReadAdapter(prisma),
    scopedEnrollmentMocks,
    scopedTeacherSubjectAllocationMocks,
    scopedGradeAssessmentMocks,
    scopedGradeItemMocks,
    scopedBehaviorRecordMocks,
    scopedBehaviorPointLedgerMocks,
    scopedAttendanceEntryMocks,
    scopedXpLedgerMocks,
    mutationMocks: {
      gradeItemCreate: scopedGradeItemMocks.create,
      behaviorRecordCreate: scopedBehaviorRecordMocks.create,
      behaviorPointLedgerCreate: scopedBehaviorPointLedgerMocks.create,
      attendanceEntryUpdate: scopedAttendanceEntryMocks.update,
      xpLedgerCreate: scopedXpLedgerMocks.create,
      xpLedgerUpdate: scopedXpLedgerMocks.update,
      xpLedgerDelete: scopedXpLedgerMocks.delete,
    },
    platformBypass,
  };
}
