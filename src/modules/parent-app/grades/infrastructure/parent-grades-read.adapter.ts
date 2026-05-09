import { Injectable } from '@nestjs/common';
import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeAssessmentType,
  GradeScopeType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { ParentAppAccessibleChild } from '../../shared/parent-app.types';
import type {
  ParentGradeAssessmentStatus,
  ParentGradeAssessmentType,
  ParentGradesQueryDto,
} from '../dto/parent-grades.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const PARENT_GRADES_ENROLLMENT_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      studentId: true,
      academicYearId: true,
      termId: true,
      academicYear: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
        },
      },
      term: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
        },
      },
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

const PARENT_GRADE_ASSESSMENT_ARGS =
  Prisma.validator<Prisma.GradeAssessmentDefaultArgs>()({
    select: {
      id: true,
      academicYearId: true,
      termId: true,
      subjectId: true,
      titleEn: true,
      titleAr: true,
      type: true,
      deliveryMode: true,
      date: true,
      weight: true,
      maxScore: true,
      expectedTimeMinutes: true,
      approvalStatus: true,
      lockedAt: true,
      subject: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          code: true,
        },
      },
    },
  });

const PARENT_GRADE_ITEM_ARGS = Prisma.validator<Prisma.GradeItemDefaultArgs>()({
  select: {
    id: true,
    assessmentId: true,
    score: true,
    status: true,
    comment: true,
    enteredAt: true,
  },
});

const PARENT_GRADE_SUBMISSION_ARGS =
  Prisma.validator<Prisma.GradeSubmissionDefaultArgs>()({
    select: {
      id: true,
      assessmentId: true,
      status: true,
      totalScore: true,
      maxScore: true,
      submittedAt: true,
      correctedAt: true,
    },
  });

export type ParentGradesEnrollmentRecord = Prisma.EnrollmentGetPayload<
  typeof PARENT_GRADES_ENROLLMENT_ARGS
>;
export type ParentGradeAssessmentRecord = Prisma.GradeAssessmentGetPayload<
  typeof PARENT_GRADE_ASSESSMENT_ARGS
>;
export type ParentGradeItemRecord = Prisma.GradeItemGetPayload<
  typeof PARENT_GRADE_ITEM_ARGS
>;
export type ParentGradeSubmissionRecord = Prisma.GradeSubmissionGetPayload<
  typeof PARENT_GRADE_SUBMISSION_ARGS
>;

export interface ParentGradesReadResult {
  child: ParentAppAccessibleChild;
  enrollment: ParentGradesEnrollmentRecord;
  assessments: ParentGradeAssessmentRecord[];
  gradeItems: ParentGradeItemRecord[];
  page: number;
  limit: number;
  total: number;
}

export interface ParentAssessmentGradeDetailReadResult {
  child: ParentAppAccessibleChild;
  enrollment: ParentGradesEnrollmentRecord;
  assessment: ParentGradeAssessmentRecord;
  gradeItem: ParentGradeItemRecord | null;
  submission: ParentGradeSubmissionRecord | null;
}

@Injectable()
export class ParentGradesReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listGrades(params: {
    child: ParentAppAccessibleChild;
    query?: ParentGradesQueryDto;
    paginate?: boolean;
  }): Promise<ParentGradesReadResult> {
    const enrollment = await this.findEnrollmentContext(params.child);
    const page =
      params.paginate === false ? 1 : resolvePage(params.query?.page);
    const limit =
      params.paginate === false
        ? MAX_LIMIT
        : resolveLimit(params.query?.limit, DEFAULT_LIMIT);
    const subjectIds = await this.listAllocatedSubjectIds(params.child);
    const where = buildAssessmentWhere({
      child: params.child,
      enrollment,
      subjectIds,
      query: params.query,
    });

    const [assessments, total] =
      params.child.termId && subjectIds.length > 0
        ? await Promise.all([
            this.scopedPrisma.gradeAssessment.findMany({
              where,
              orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
              ...(params.paginate === false
                ? {}
                : { take: limit, skip: (page - 1) * limit }),
              ...PARENT_GRADE_ASSESSMENT_ARGS,
            }),
            this.scopedPrisma.gradeAssessment.count({ where }),
          ])
        : [[], 0];

    const gradeItems =
      assessments.length === 0
        ? []
        : await this.scopedPrisma.gradeItem.findMany({
            where: {
              assessmentId: {
                in: assessments.map((assessment) => assessment.id),
              },
              studentId: params.child.studentId,
              enrollmentId: params.child.enrollmentId,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            ...PARENT_GRADE_ITEM_ARGS,
          });

    return {
      child: params.child,
      enrollment,
      assessments,
      gradeItems,
      page,
      limit,
      total,
    };
  }

  async findAssessmentGrade(params: {
    child: ParentAppAccessibleChild;
    assessmentId: string;
  }): Promise<ParentAssessmentGradeDetailReadResult | null> {
    const enrollment = await this.findEnrollmentContext(params.child);
    const subjectIds = await this.listAllocatedSubjectIds(params.child);
    if (!params.child.termId || subjectIds.length === 0) return null;

    const assessment = await this.scopedPrisma.gradeAssessment.findFirst({
      where: {
        ...buildAssessmentWhere({
          child: params.child,
          enrollment,
          subjectIds,
        }),
        id: params.assessmentId,
      },
      ...PARENT_GRADE_ASSESSMENT_ARGS,
    });

    if (!assessment) return null;

    const [gradeItem, submission] = await Promise.all([
      this.scopedPrisma.gradeItem.findFirst({
        where: {
          assessmentId: assessment.id,
          studentId: params.child.studentId,
          enrollmentId: params.child.enrollmentId,
        },
        ...PARENT_GRADE_ITEM_ARGS,
      }),
      this.scopedPrisma.gradeSubmission.findFirst({
        where: {
          assessmentId: assessment.id,
          studentId: params.child.studentId,
          enrollmentId: params.child.enrollmentId,
        },
        ...PARENT_GRADE_SUBMISSION_ARGS,
      }),
    ]);

    return {
      child: params.child,
      enrollment,
      assessment,
      gradeItem,
      submission,
    };
  }

  private findEnrollmentContext(
    child: ParentAppAccessibleChild,
  ): Promise<ParentGradesEnrollmentRecord> {
    return this.scopedPrisma.enrollment.findFirstOrThrow({
      where: {
        id: child.enrollmentId,
        studentId: child.studentId,
        academicYearId: child.academicYearId,
      },
      ...PARENT_GRADES_ENROLLMENT_ARGS,
    });
  }

  private async listAllocatedSubjectIds(
    child: ParentAppAccessibleChild,
  ): Promise<string[]> {
    if (!child.termId) return [];

    const rows = await this.scopedPrisma.teacherSubjectAllocation.findMany({
      where: {
        classroomId: child.classroomId,
        termId: child.termId,
        subject: {
          is: {
            isActive: true,
            deletedAt: null,
          },
        },
      },
      distinct: ['subjectId'],
      select: { subjectId: true },
    });

    return rows.map((row) => row.subjectId);
  }
}

function buildAssessmentWhere(params: {
  child: ParentAppAccessibleChild;
  enrollment: ParentGradesEnrollmentRecord;
  subjectIds: string[];
  query?: Pick<ParentGradesQueryDto, 'subjectId' | 'type' | 'status'>;
}): Prisma.GradeAssessmentWhereInput {
  const section = params.enrollment.classroom.section;
  const grade = section.grade;
  const stage = grade.stage;
  const requestedSubjectIds = params.query?.subjectId
    ? params.subjectIds.filter(
        (subjectId) => subjectId === params.query?.subjectId,
      )
    : params.subjectIds;

  return {
    academicYearId: params.child.academicYearId,
    termId: params.child.termId ?? undefined,
    subjectId: { in: requestedSubjectIds },
    ...(params.query?.type
      ? { type: toCoreAssessmentType(params.query.type) }
      : {}),
    approvalStatus: {
      in: [
        GradeAssessmentApprovalStatus.PUBLISHED,
        GradeAssessmentApprovalStatus.APPROVED,
      ],
    },
    ...buildAssessmentStatusWhere(params.query?.status),
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

function buildAssessmentStatusWhere(
  status?: ParentGradeAssessmentStatus,
): Prisma.GradeAssessmentWhereInput {
  switch (status) {
    case 'published':
      return {
        approvalStatus: GradeAssessmentApprovalStatus.PUBLISHED,
        lockedAt: null,
      };
    case 'approved':
      return {
        approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
        lockedAt: null,
      };
    case 'locked':
      return {
        approvalStatus: GradeAssessmentApprovalStatus.APPROVED,
        lockedAt: { not: null },
      };
    case undefined:
      return {};
  }
}

function toCoreAssessmentType(
  type: ParentGradeAssessmentType,
): GradeAssessmentType {
  switch (type) {
    case 'quiz':
      return GradeAssessmentType.QUIZ;
    case 'month_exam':
      return GradeAssessmentType.MONTH_EXAM;
    case 'midterm':
      return GradeAssessmentType.MIDTERM;
    case 'term_exam':
      return GradeAssessmentType.TERM_EXAM;
    case 'assignment':
      return GradeAssessmentType.ASSIGNMENT;
    case 'final':
      return GradeAssessmentType.FINAL;
    case 'practical':
      return GradeAssessmentType.PRACTICAL;
  }
}

function resolveLimit(limit: number | undefined, defaultLimit: number): number {
  if (!limit || Number.isNaN(limit)) return defaultLimit;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function resolvePage(page?: number): number {
  if (!page || Number.isNaN(page)) return 1;
  return Math.max(Math.trunc(page), 1);
}
