import { Injectable } from '@nestjs/common';
import {
  AttendanceSessionStatus,
  AttendanceStatus,
  BehaviorPointLedgerEntryType,
  BehaviorRecordStatus,
  BehaviorRecordType,
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeItemStatus,
  GradeScopeType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';

const PARENT_PROGRESS_ENROLLMENT_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      classroom: {
        select: {
          id: true,
          section: {
            select: {
              id: true,
              grade: {
                select: {
                  id: true,
                  stage: {
                    select: {
                      id: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

const PARENT_PROGRESS_SUBJECT_ALLOCATION_ARGS =
  Prisma.validator<Prisma.TeacherSubjectAllocationDefaultArgs>()({
    select: {
      subjectId: true,
      subject: {
        select: {
          id: true,
          nameEn: true,
          nameAr: true,
        },
      },
    },
  });

const PARENT_PROGRESS_ASSESSMENT_ARGS =
  Prisma.validator<Prisma.GradeAssessmentDefaultArgs>()({
    select: {
      id: true,
      subjectId: true,
      maxScore: true,
      subject: {
        select: {
          id: true,
          nameEn: true,
          nameAr: true,
        },
      },
    },
  });

const PARENT_PROGRESS_GRADE_ITEM_ARGS =
  Prisma.validator<Prisma.GradeItemDefaultArgs>()({
    select: {
      assessmentId: true,
      score: true,
      status: true,
    },
  });

export type ParentProgressEnrollmentRecord = Prisma.EnrollmentGetPayload<
  typeof PARENT_PROGRESS_ENROLLMENT_ARGS
>;
export type ParentProgressSubjectAllocationRecord =
  Prisma.TeacherSubjectAllocationGetPayload<
    typeof PARENT_PROGRESS_SUBJECT_ALLOCATION_ARGS
  >;
export type ParentProgressAssessmentRecord = Prisma.GradeAssessmentGetPayload<
  typeof PARENT_PROGRESS_ASSESSMENT_ARGS
>;
export type ParentProgressGradeItemRecord = Prisma.GradeItemGetPayload<
  typeof PARENT_PROGRESS_GRADE_ITEM_ARGS
>;

export interface ParentAcademicProgressReadModel {
  child: ParentAppAccessibleChild;
  subjects: Array<{
    subjectId: string;
    subjectName: string;
    earnedMarks: number;
    totalMarks: number;
    percentage: number | null;
  }>;
  totalEarned: number;
  totalMax: number;
  percentage: number | null;
}

export interface ParentBehaviorProgressReadModel {
  child: ParentAppAccessibleChild;
  attendanceCount: number;
  absenceCount: number;
  latenessCount: number;
  positiveCount: number;
  negativeCount: number;
  positivePoints: number;
  negativePoints: number;
  totalBehaviorPoints: number;
}

export interface ParentXpProgressReadModel {
  child: ParentAppAccessibleChild;
  totalXp: number;
  entriesCount: number;
  bySource: Array<{
    sourceType: string;
    totalXp: number;
    entriesCount: number;
  }>;
}

export interface ParentProgressOverviewReadModel {
  child: ParentAppAccessibleChild;
  academic: ParentAcademicProgressReadModel;
  behavior: ParentBehaviorProgressReadModel;
  xp: ParentXpProgressReadModel;
}

@Injectable()
export class ParentProgressReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async getProgressOverview(
    child: ParentAppAccessibleChild,
  ): Promise<ParentProgressOverviewReadModel> {
    const [academic, behavior, xp] = await Promise.all([
      this.getAcademicProgress(child),
      this.getBehaviorProgress(child),
      this.getXpProgress(child),
    ]);

    return { child, academic, behavior, xp };
  }

  async getAcademicProgress(
    child: ParentAppAccessibleChild,
  ): Promise<ParentAcademicProgressReadModel> {
    if (!child.termId) return emptyAcademicProgress(child);

    const enrollment = await this.findEnrollmentContext(child);
    const allocations = await this.listAllocatedSubjects(child);
    const subjectIds = allocations.map((allocation) => allocation.subjectId);
    if (subjectIds.length === 0) return emptyAcademicProgress(child);

    const assessments = await this.scopedPrisma.gradeAssessment.findMany({
      where: buildVisibleAssessmentWhere({ child, enrollment, subjectIds }),
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      ...PARENT_PROGRESS_ASSESSMENT_ARGS,
    });

    if (assessments.length === 0) {
      return buildAcademicProgress({
        child,
        allocations,
        assessments,
        gradeItems: [],
      });
    }

    const gradeItems = await this.scopedPrisma.gradeItem.findMany({
      where: {
        assessmentId: { in: assessments.map((assessment) => assessment.id) },
        studentId: child.studentId,
        enrollmentId: child.enrollmentId,
      },
      ...PARENT_PROGRESS_GRADE_ITEM_ARGS,
    });

    return buildAcademicProgress({
      child,
      allocations,
      assessments,
      gradeItems,
    });
  }

  async getBehaviorProgress(
    child: ParentAppAccessibleChild,
  ): Promise<ParentBehaviorProgressReadModel> {
    const behaviorWhere = buildApprovedBehaviorWhere(child);
    const [recordGroups, ledgerTotal, attendanceGroups] = await Promise.all([
      this.scopedPrisma.behaviorRecord.groupBy({
        by: ['type'],
        where: behaviorWhere,
        _count: { _all: true },
        _sum: { points: true },
      }),
      this.scopedPrisma.behaviorPointLedger.aggregate({
        where: buildBehaviorPointLedgerWhere(child),
        _sum: { amount: true },
      }),
      this.scopedPrisma.attendanceEntry.groupBy({
        by: ['status'],
        where: buildAttendanceEntryWhere(child),
        _count: { _all: true },
      }),
    ]);

    const positive = recordGroups.find(
      (group) => group.type === BehaviorRecordType.POSITIVE,
    );
    const negative = recordGroups.find(
      (group) => group.type === BehaviorRecordType.NEGATIVE,
    );
    const attendanceCounts = new Map(
      attendanceGroups.map((group) => [group.status, group._count._all]),
    );
    const positivePoints = positive?._sum.points ?? 0;
    const negativePoints = negative?._sum.points ?? 0;

    return {
      child,
      attendanceCount: attendanceCounts.get(AttendanceStatus.PRESENT) ?? 0,
      absenceCount: attendanceCounts.get(AttendanceStatus.ABSENT) ?? 0,
      latenessCount: attendanceCounts.get(AttendanceStatus.LATE) ?? 0,
      positiveCount: positive?._count._all ?? 0,
      negativeCount: negative?._count._all ?? 0,
      positivePoints,
      negativePoints,
      totalBehaviorPoints:
        ledgerTotal._sum.amount ?? positivePoints + negativePoints,
    };
  }

  async getXpProgress(
    child: ParentAppAccessibleChild,
  ): Promise<ParentXpProgressReadModel> {
    const where = buildXpLedgerWhere(child);
    const [aggregate, count, bySourceGroups] = await Promise.all([
      this.scopedPrisma.xpLedger.aggregate({
        where,
        _sum: { amount: true },
      }),
      this.scopedPrisma.xpLedger.count({ where }),
      this.scopedPrisma.xpLedger.groupBy({
        by: ['sourceType'],
        where,
        _count: { _all: true },
        _sum: { amount: true },
      }),
    ]);

    return {
      child,
      totalXp: aggregate._sum.amount ?? 0,
      entriesCount: count,
      bySource: bySourceGroups.map((group) => ({
        sourceType: String(group.sourceType).toLowerCase(),
        totalXp: group._sum.amount ?? 0,
        entriesCount: group._count._all,
      })),
    };
  }

  private findEnrollmentContext(
    child: ParentAppAccessibleChild,
  ): Promise<ParentProgressEnrollmentRecord> {
    return this.scopedPrisma.enrollment.findFirstOrThrow({
      where: {
        id: child.enrollmentId,
        studentId: child.studentId,
        academicYearId: child.academicYearId,
      },
      ...PARENT_PROGRESS_ENROLLMENT_ARGS,
    });
  }

  private listAllocatedSubjects(
    child: ParentAppAccessibleChild,
  ): Promise<ParentProgressSubjectAllocationRecord[]> {
    return this.scopedPrisma.teacherSubjectAllocation.findMany({
      where: {
        classroomId: child.classroomId,
        termId: child.termId ?? undefined,
        subject: {
          is: {
            isActive: true,
            deletedAt: null,
          },
        },
      },
      distinct: ['subjectId'],
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...PARENT_PROGRESS_SUBJECT_ALLOCATION_ARGS,
    });
  }
}

function buildVisibleAssessmentWhere(params: {
  child: ParentAppAccessibleChild;
  enrollment: ParentProgressEnrollmentRecord;
  subjectIds: string[];
}): Prisma.GradeAssessmentWhereInput {
  const section = params.enrollment.classroom.section;
  const grade = section.grade;
  const stage = grade.stage;

  return {
    academicYearId: params.child.academicYearId,
    termId: params.child.termId ?? undefined,
    subjectId: { in: params.subjectIds },
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
    OR: [
      {
        scopeType: GradeScopeType.SCHOOL,
        scopeKey: params.enrollment.schoolId,
      },
      { scopeType: GradeScopeType.STAGE, scopeKey: stage.id },
      { scopeType: GradeScopeType.GRADE, scopeKey: grade.id },
      { scopeType: GradeScopeType.SECTION, scopeKey: section.id },
      {
        scopeType: GradeScopeType.CLASSROOM,
        scopeKey: params.child.classroomId,
      },
    ],
  };
}

function buildApprovedBehaviorWhere(
  child: ParentAppAccessibleChild,
): Prisma.BehaviorRecordWhereInput {
  return {
    studentId: child.studentId,
    enrollmentId: child.enrollmentId,
    academicYearId: child.academicYearId,
    status: BehaviorRecordStatus.APPROVED,
    ...(child.termId
      ? { OR: [{ termId: child.termId }, { termId: null }] }
      : {}),
  };
}

function buildBehaviorPointLedgerWhere(
  child: ParentAppAccessibleChild,
): Prisma.BehaviorPointLedgerWhereInput {
  return {
    studentId: child.studentId,
    enrollmentId: child.enrollmentId,
    academicYearId: child.academicYearId,
    entryType: {
      in: [
        BehaviorPointLedgerEntryType.AWARD,
        BehaviorPointLedgerEntryType.PENALTY,
        BehaviorPointLedgerEntryType.REVERSAL,
      ],
    },
    ...(child.termId
      ? { OR: [{ termId: child.termId }, { termId: null }] }
      : {}),
    record: {
      status: BehaviorRecordStatus.APPROVED,
      deletedAt: null,
    },
  };
}

function buildAttendanceEntryWhere(
  child: ParentAppAccessibleChild,
): Prisma.AttendanceEntryWhereInput {
  return {
    studentId: child.studentId,
    enrollmentId: child.enrollmentId,
    session: {
      academicYearId: child.academicYearId,
      ...(child.termId ? { termId: child.termId } : {}),
      status: AttendanceSessionStatus.SUBMITTED,
      deletedAt: null,
    },
  };
}

function buildXpLedgerWhere(
  child: ParentAppAccessibleChild,
): Prisma.XpLedgerWhereInput {
  return {
    studentId: child.studentId,
    enrollmentId: child.enrollmentId,
    academicYearId: child.academicYearId,
    ...(child.termId ? { termId: child.termId } : {}),
  };
}

function buildAcademicProgress(params: {
  child: ParentAppAccessibleChild;
  allocations: ParentProgressSubjectAllocationRecord[];
  assessments: ParentProgressAssessmentRecord[];
  gradeItems: ParentProgressGradeItemRecord[];
}): ParentAcademicProgressReadModel {
  const itemsByAssessmentId = new Map(
    params.gradeItems.map((item) => [item.assessmentId, item]),
  );
  const subjectsById = new Map(
    params.allocations.map((allocation) => [
      allocation.subjectId,
      displayName(allocation.subject),
    ]),
  );
  const rows = new Map<
    string,
    {
      subjectId: string;
      subjectName: string;
      earnedMarks: number;
      totalMarks: number;
      percentage: number | null;
    }
  >();

  for (const [subjectId, subjectName] of subjectsById.entries()) {
    rows.set(subjectId, {
      subjectId,
      subjectName,
      earnedMarks: 0,
      totalMarks: 0,
      percentage: null,
    });
  }

  for (const assessment of params.assessments) {
    const row = rows.get(assessment.subjectId) ?? {
      subjectId: assessment.subjectId,
      subjectName: displayName(assessment.subject),
      earnedMarks: 0,
      totalMarks: 0,
      percentage: null,
    };
    const item = itemsByAssessmentId.get(assessment.id);
    const maxScore = decimalToNumber(assessment.maxScore) ?? 0;
    row.totalMarks += maxScore;
    if (item?.status === GradeItemStatus.ENTERED) {
      row.earnedMarks += decimalToNumber(item.score) ?? 0;
    }
    row.percentage = calculatePercent(row.earnedMarks, row.totalMarks);
    rows.set(assessment.subjectId, row);
  }

  const subjects = [...rows.values()];
  const totalEarned = subjects.reduce((sum, row) => sum + row.earnedMarks, 0);
  const totalMax = subjects.reduce((sum, row) => sum + row.totalMarks, 0);

  return {
    child: params.child,
    subjects,
    totalEarned,
    totalMax,
    percentage: calculatePercent(totalEarned, totalMax),
  };
}

function emptyAcademicProgress(
  child: ParentAppAccessibleChild,
): ParentAcademicProgressReadModel {
  return {
    child,
    subjects: [],
    totalEarned: 0,
    totalMax: 0,
    percentage: null,
  };
}

function displayName(node: { nameEn: string; nameAr: string }): string {
  return node.nameEn || node.nameAr;
}

function decimalToNumber(
  value: number | string | { toNumber: () => number } | null | undefined,
): number | null {
  if (value === undefined || value === null || value === '') return null;
  const numberValue =
    typeof value === 'object' && 'toNumber' in value
      ? value.toNumber()
      : Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function calculatePercent(earned: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((earned / total) * 10000) / 100;
}
