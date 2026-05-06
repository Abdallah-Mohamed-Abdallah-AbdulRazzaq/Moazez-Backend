import { Injectable } from '@nestjs/common';
import {
  GradeAssessmentApprovalStatus,
  GradeItemStatus,
  GradeScopeType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';

const STUDENT_SUBJECT_ALLOCATION_ARGS =
  Prisma.validator<Prisma.TeacherSubjectAllocationDefaultArgs>()({
    select: {
      id: true,
      subjectId: true,
      classroomId: true,
      termId: true,
      teacherUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      subject: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          code: true,
          color: true,
        },
      },
      classroom: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          section: {
            select: {
              id: true,
              nameAr: true,
              nameEn: true,
              grade: {
                select: {
                  id: true,
                  nameAr: true,
                  nameEn: true,
                  stage: {
                    select: {
                      id: true,
                      nameAr: true,
                      nameEn: true,
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

const STUDENT_SUBJECT_ASSESSMENT_ARGS =
  Prisma.validator<Prisma.GradeAssessmentDefaultArgs>()({
    select: {
      id: true,
      subjectId: true,
      maxScore: true,
    },
  });

const STUDENT_SUBJECT_GRADE_ITEM_ARGS =
  Prisma.validator<Prisma.GradeItemDefaultArgs>()({
    select: {
      assessmentId: true,
      score: true,
      status: true,
    },
  });

export type StudentSubjectAllocationRecord = Prisma.TeacherSubjectAllocationGetPayload<
  typeof STUDENT_SUBJECT_ALLOCATION_ARGS
>;

type StudentSubjectAssessmentRecord = Prisma.GradeAssessmentGetPayload<
  typeof STUDENT_SUBJECT_ASSESSMENT_ARGS
>;

type StudentSubjectGradeItemRecord = Prisma.GradeItemGetPayload<
  typeof STUDENT_SUBJECT_GRADE_ITEM_ARGS
>;

export interface StudentSubjectStatsRecord {
  assessmentsCount: number;
  gradedCount: number;
  missingCount: number;
  absentCount: number;
  earnedScore: number;
  maxScore: number;
  averagePercent: number | null;
}

@Injectable()
export class StudentSubjectsReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  listCurrentSubjects(
    context: StudentAppContext,
  ): Promise<StudentSubjectAllocationRecord[]> {
    if (!context.termId) return Promise.resolve([]);

    return this.scopedPrisma.teacherSubjectAllocation.findMany({
      where: {
        classroomId: context.classroomId,
        termId: context.termId,
        subject: {
          is: {
            isActive: true,
            deletedAt: null,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...STUDENT_SUBJECT_ALLOCATION_ARGS,
    });
  }

  findCurrentSubject(params: {
    context: StudentAppContext;
    subjectId: string;
  }): Promise<StudentSubjectAllocationRecord | null> {
    if (!params.context.termId) return Promise.resolve(null);

    return this.scopedPrisma.teacherSubjectAllocation.findFirst({
      where: {
        classroomId: params.context.classroomId,
        termId: params.context.termId,
        subjectId: params.subjectId,
        subject: {
          is: {
            isActive: true,
            deletedAt: null,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...STUDENT_SUBJECT_ALLOCATION_ARGS,
    });
  }

  async summarizeSubjectGrades(params: {
    context: StudentAppContext;
    subjectIds: string[];
    classroom: StudentSubjectAllocationRecord['classroom'];
  }): Promise<Map<string, StudentSubjectStatsRecord>> {
    const subjectIds = unique(params.subjectIds);
    if (!params.context.termId || subjectIds.length === 0) {
      return new Map();
    }

    const assessmentWhere = buildVisibleAssessmentWhere({
      context: params.context,
      classroom: params.classroom,
      subjectIds,
    });

    const assessments = await this.scopedPrisma.gradeAssessment.findMany({
      where: assessmentWhere,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      ...STUDENT_SUBJECT_ASSESSMENT_ARGS,
    });

    if (assessments.length === 0) return new Map();

    const gradeItems = await this.scopedPrisma.gradeItem.findMany({
      where: {
        assessmentId: { in: assessments.map((assessment) => assessment.id) },
        studentId: params.context.studentId,
      },
      ...STUDENT_SUBJECT_GRADE_ITEM_ARGS,
    });

    return buildStatsMap(assessments, gradeItems);
  }
}

function buildVisibleAssessmentWhere(params: {
  context: StudentAppContext;
  classroom: StudentSubjectAllocationRecord['classroom'];
  subjectIds: string[];
}): Prisma.GradeAssessmentWhereInput {
  const section = params.classroom.section;
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

function buildStatsMap(
  assessments: StudentSubjectAssessmentRecord[],
  gradeItems: StudentSubjectGradeItemRecord[],
): Map<string, StudentSubjectStatsRecord> {
  const itemsByAssessmentId = new Map(
    gradeItems.map((item) => [item.assessmentId, item]),
  );
  const stats = new Map<string, StudentSubjectStatsRecord>();

  for (const assessment of assessments) {
    const current = stats.get(assessment.subjectId) ?? emptyStats();
    const item = itemsByAssessmentId.get(assessment.id) ?? null;
    const maxScore = decimalToNumber(assessment.maxScore) ?? 0;
    const score = decimalToNumber(item?.score) ?? 0;

    current.assessmentsCount += 1;
    current.maxScore += maxScore;

    if (!item || item.status === GradeItemStatus.MISSING) {
      current.missingCount += 1;
    } else if (item.status === GradeItemStatus.ABSENT) {
      current.absentCount += 1;
    } else if (item.status === GradeItemStatus.ENTERED) {
      current.gradedCount += 1;
      current.earnedScore += score;
    }

    current.averagePercent =
      current.maxScore > 0
        ? roundPercent((current.earnedScore / current.maxScore) * 100)
        : null;
    stats.set(assessment.subjectId, current);
  }

  return stats;
}

export function emptyStudentSubjectStats(): StudentSubjectStatsRecord {
  return emptyStats();
}

function emptyStats(): StudentSubjectStatsRecord {
  return {
    assessmentsCount: 0,
    gradedCount: 0,
    missingCount: 0,
    absentCount: 0,
    earnedScore: 0,
    maxScore: 0,
    averagePercent: null,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function decimalToNumber(
  value:
    | number
    | string
    | { toNumber: () => number }
    | null
    | undefined,
): number | null {
  if (value === undefined || value === null || value === '') return null;
  const numberValue =
    typeof value === 'object' && 'toNumber' in value
      ? value.toNumber()
      : Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}
