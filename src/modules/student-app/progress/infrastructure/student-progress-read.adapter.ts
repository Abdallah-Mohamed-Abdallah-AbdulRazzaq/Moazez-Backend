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
import type { StudentAppContext } from '../../shared/student-app.types';

const STUDENT_PROGRESS_ENROLLMENT_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
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

const STUDENT_PROGRESS_SUBJECT_ALLOCATION_ARGS =
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

const STUDENT_PROGRESS_ASSESSMENT_ARGS =
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

const STUDENT_PROGRESS_GRADE_ITEM_ARGS =
  Prisma.validator<Prisma.GradeItemDefaultArgs>()({
    select: {
      assessmentId: true,
      score: true,
      status: true,
    },
  });

export type StudentProgressEnrollmentRecord = Prisma.EnrollmentGetPayload<
  typeof STUDENT_PROGRESS_ENROLLMENT_ARGS
>;
export type StudentProgressSubjectAllocationRecord =
  Prisma.TeacherSubjectAllocationGetPayload<
    typeof STUDENT_PROGRESS_SUBJECT_ALLOCATION_ARGS
  >;
export type StudentProgressAssessmentRecord = Prisma.GradeAssessmentGetPayload<
  typeof STUDENT_PROGRESS_ASSESSMENT_ARGS
>;
export type StudentProgressGradeItemRecord = Prisma.GradeItemGetPayload<
  typeof STUDENT_PROGRESS_GRADE_ITEM_ARGS
>;

export interface StudentAcademicProgressReadModel {
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

export interface StudentBehaviorProgressReadModel {
  attendanceCount: number;
  absenceCount: number;
  latenessCount: number;
  positiveCount: number;
  negativeCount: number;
  positivePoints: number;
  negativePoints: number;
  totalBehaviorPoints: number;
}

export interface StudentXpProgressReadModel {
  totalXp: number;
  entriesCount: number;
  bySource: Array<{
    sourceType: string;
    totalXp: number;
    entriesCount: number;
  }>;
}

export interface StudentProgressOverviewReadModel {
  academic: StudentAcademicProgressReadModel;
  behavior: StudentBehaviorProgressReadModel;
  xp: StudentXpProgressReadModel;
}

@Injectable()
export class StudentProgressReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async getProgressOverview(
    context: StudentAppContext,
  ): Promise<StudentProgressOverviewReadModel> {
    const [academic, behavior, xp] = await Promise.all([
      this.getAcademicProgress(context),
      this.getBehaviorProgress(context),
      this.getXpProgress(context),
    ]);

    return { academic, behavior, xp };
  }

  async getAcademicProgress(
    context: StudentAppContext,
  ): Promise<StudentAcademicProgressReadModel> {
    if (!context.termId) return emptyAcademicProgress();

    const enrollment = await this.findEnrollmentContext(context);
    const allocations = await this.listAllocatedSubjects(context);
    const subjectIds = allocations.map((allocation) => allocation.subjectId);
    if (subjectIds.length === 0) return emptyAcademicProgress();

    const assessments = await this.scopedPrisma.gradeAssessment.findMany({
      where: buildVisibleAssessmentWhere({ context, enrollment, subjectIds }),
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      ...STUDENT_PROGRESS_ASSESSMENT_ARGS,
    });

    if (assessments.length === 0) {
      return buildAcademicProgress({
        allocations,
        assessments,
        gradeItems: [],
      });
    }

    const gradeItems = await this.scopedPrisma.gradeItem.findMany({
      where: {
        assessmentId: { in: assessments.map((assessment) => assessment.id) },
        studentId: context.studentId,
      },
      ...STUDENT_PROGRESS_GRADE_ITEM_ARGS,
    });

    return buildAcademicProgress({ allocations, assessments, gradeItems });
  }

  async getBehaviorProgress(
    context: StudentAppContext,
  ): Promise<StudentBehaviorProgressReadModel> {
    const behaviorWhere = buildApprovedBehaviorWhere(context);
    const [recordGroups, ledgerTotal, attendanceGroups] = await Promise.all([
      this.scopedPrisma.behaviorRecord.groupBy({
        by: ['type'],
        where: behaviorWhere,
        _count: { _all: true },
        _sum: { points: true },
      }),
      this.scopedPrisma.behaviorPointLedger.aggregate({
        where: buildBehaviorPointLedgerWhere(context),
        _sum: { amount: true },
      }),
      this.scopedPrisma.attendanceEntry.groupBy({
        by: ['status'],
        where: buildAttendanceEntryWhere(context),
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
    context: StudentAppContext,
  ): Promise<StudentXpProgressReadModel> {
    const where = buildXpLedgerWhere(context);
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
    context: StudentAppContext,
  ): Promise<StudentProgressEnrollmentRecord> {
    return this.scopedPrisma.enrollment.findFirstOrThrow({
      where: {
        id: context.enrollmentId,
        studentId: context.studentId,
        academicYearId: context.academicYearId,
      },
      ...STUDENT_PROGRESS_ENROLLMENT_ARGS,
    });
  }

  private listAllocatedSubjects(
    context: StudentAppContext,
  ): Promise<StudentProgressSubjectAllocationRecord[]> {
    return this.scopedPrisma.teacherSubjectAllocation.findMany({
      where: {
        classroomId: context.classroomId,
        termId: context.termId ?? undefined,
        subject: {
          is: {
            isActive: true,
            deletedAt: null,
          },
        },
      },
      distinct: ['subjectId'],
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...STUDENT_PROGRESS_SUBJECT_ALLOCATION_ARGS,
    });
  }
}

function buildVisibleAssessmentWhere(params: {
  context: StudentAppContext;
  enrollment: StudentProgressEnrollmentRecord;
  subjectIds: string[];
}): Prisma.GradeAssessmentWhereInput {
  const section = params.enrollment.classroom.section;
  const grade = section.grade;
  const stage = grade.stage;

  return {
    academicYearId: params.context.academicYearId,
    termId: params.context.termId ?? undefined,
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
      { scopeType: GradeScopeType.SCHOOL, scopeKey: params.context.schoolId },
      { scopeType: GradeScopeType.STAGE, scopeKey: stage.id },
      { scopeType: GradeScopeType.GRADE, scopeKey: grade.id },
      { scopeType: GradeScopeType.SECTION, scopeKey: section.id },
      {
        scopeType: GradeScopeType.CLASSROOM,
        scopeKey: params.context.classroomId,
      },
    ],
  };
}

function buildApprovedBehaviorWhere(
  context: StudentAppContext,
): Prisma.BehaviorRecordWhereInput {
  return {
    studentId: context.studentId,
    academicYearId: context.academicYearId,
    status: BehaviorRecordStatus.APPROVED,
    ...(context.termId
      ? { OR: [{ termId: context.termId }, { termId: null }] }
      : {}),
  };
}

function buildBehaviorPointLedgerWhere(
  context: StudentAppContext,
): Prisma.BehaviorPointLedgerWhereInput {
  return {
    studentId: context.studentId,
    academicYearId: context.academicYearId,
    entryType: {
      in: [
        BehaviorPointLedgerEntryType.AWARD,
        BehaviorPointLedgerEntryType.PENALTY,
        BehaviorPointLedgerEntryType.REVERSAL,
      ],
    },
    ...(context.termId
      ? { OR: [{ termId: context.termId }, { termId: null }] }
      : {}),
    record: {
      status: BehaviorRecordStatus.APPROVED,
      deletedAt: null,
    },
  };
}

function buildAttendanceEntryWhere(
  context: StudentAppContext,
): Prisma.AttendanceEntryWhereInput {
  return {
    studentId: context.studentId,
    enrollmentId: context.enrollmentId,
    session: {
      academicYearId: context.academicYearId,
      ...(context.termId ? { termId: context.termId } : {}),
      status: AttendanceSessionStatus.SUBMITTED,
      deletedAt: null,
    },
  };
}

function buildXpLedgerWhere(
  context: StudentAppContext,
): Prisma.XpLedgerWhereInput {
  return {
    studentId: context.studentId,
    academicYearId: context.academicYearId,
    ...(context.termId ? { termId: context.termId } : {}),
  };
}

function buildAcademicProgress(params: {
  allocations: StudentProgressSubjectAllocationRecord[];
  assessments: StudentProgressAssessmentRecord[];
  gradeItems: StudentProgressGradeItemRecord[];
}): StudentAcademicProgressReadModel {
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
    subjects,
    totalEarned,
    totalMax,
    percentage: calculatePercent(totalEarned, totalMax),
  };
}

function emptyAcademicProgress(): StudentAcademicProgressReadModel {
  return {
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
