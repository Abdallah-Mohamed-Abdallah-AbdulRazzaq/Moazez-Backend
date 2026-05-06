import { Injectable } from '@nestjs/common';
import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeAssessmentType,
  GradeScopeType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';
import type {
  StudentGradeAssessmentStatus,
  StudentGradeAssessmentType,
  StudentGradesQueryDto,
} from '../dto/student-grades.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const STUDENT_GRADES_ENROLLMENT_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
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

const STUDENT_GRADE_ASSESSMENT_ARGS =
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

const STUDENT_GRADE_ITEM_ARGS =
  Prisma.validator<Prisma.GradeItemDefaultArgs>()({
    select: {
      id: true,
      assessmentId: true,
      score: true,
      status: true,
      comment: true,
      enteredAt: true,
    },
  });

const STUDENT_GRADE_SUBMISSION_ARGS =
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

export type StudentGradesEnrollmentRecord = Prisma.EnrollmentGetPayload<
  typeof STUDENT_GRADES_ENROLLMENT_ARGS
>;
export type StudentGradeAssessmentRecord = Prisma.GradeAssessmentGetPayload<
  typeof STUDENT_GRADE_ASSESSMENT_ARGS
>;
export type StudentGradeItemRecord = Prisma.GradeItemGetPayload<
  typeof STUDENT_GRADE_ITEM_ARGS
>;
export type StudentGradeSubmissionRecord = Prisma.GradeSubmissionGetPayload<
  typeof STUDENT_GRADE_SUBMISSION_ARGS
>;

export interface StudentGradesReadResult {
  enrollment: StudentGradesEnrollmentRecord;
  assessments: StudentGradeAssessmentRecord[];
  gradeItems: StudentGradeItemRecord[];
  page: number;
  limit: number;
  total: number;
}

export interface StudentAssessmentGradeDetailReadResult {
  enrollment: StudentGradesEnrollmentRecord;
  assessment: StudentGradeAssessmentRecord;
  gradeItem: StudentGradeItemRecord | null;
  submission: StudentGradeSubmissionRecord | null;
}

@Injectable()
export class StudentGradesReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listGrades(params: {
    context: StudentAppContext;
    query?: StudentGradesQueryDto;
    paginate?: boolean;
  }): Promise<StudentGradesReadResult> {
    const enrollment = await this.findEnrollmentContext(params.context);
    const page = params.paginate === false ? 1 : resolvePage(params.query?.page);
    const limit =
      params.paginate === false
        ? MAX_LIMIT
        : resolveLimit(params.query?.limit, DEFAULT_LIMIT);
    const subjectIds = await this.listAllocatedSubjectIds(params.context);
    const where = buildAssessmentWhere({
      context: params.context,
      enrollment,
      subjectIds,
      query: params.query,
    });

    const [assessments, total] =
      params.context.termId && subjectIds.length > 0
        ? await Promise.all([
            this.scopedPrisma.gradeAssessment.findMany({
              where,
              orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
              ...(params.paginate === false
                ? {}
                : { take: limit, skip: (page - 1) * limit }),
              ...STUDENT_GRADE_ASSESSMENT_ARGS,
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
              studentId: params.context.studentId,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            ...STUDENT_GRADE_ITEM_ARGS,
          });

    return {
      enrollment,
      assessments,
      gradeItems,
      page,
      limit,
      total,
    };
  }

  async findAssessmentGrade(params: {
    context: StudentAppContext;
    assessmentId: string;
  }): Promise<StudentAssessmentGradeDetailReadResult | null> {
    const enrollment = await this.findEnrollmentContext(params.context);
    const subjectIds = await this.listAllocatedSubjectIds(params.context);
    if (!params.context.termId || subjectIds.length === 0) return null;

    const assessment = await this.scopedPrisma.gradeAssessment.findFirst({
      where: {
        ...buildAssessmentWhere({
          context: params.context,
          enrollment,
          subjectIds,
        }),
        id: params.assessmentId,
      },
      ...STUDENT_GRADE_ASSESSMENT_ARGS,
    });

    if (!assessment) return null;

    const [gradeItem, submission] = await Promise.all([
      this.scopedPrisma.gradeItem.findFirst({
        where: {
          assessmentId: assessment.id,
          studentId: params.context.studentId,
        },
        ...STUDENT_GRADE_ITEM_ARGS,
      }),
      this.scopedPrisma.gradeSubmission.findFirst({
        where: {
          assessmentId: assessment.id,
          studentId: params.context.studentId,
          enrollmentId: params.context.enrollmentId,
        },
        ...STUDENT_GRADE_SUBMISSION_ARGS,
      }),
    ]);

    return { enrollment, assessment, gradeItem, submission };
  }

  private findEnrollmentContext(
    context: StudentAppContext,
  ): Promise<StudentGradesEnrollmentRecord> {
    return this.scopedPrisma.enrollment.findFirstOrThrow({
      where: {
        id: context.enrollmentId,
        studentId: context.studentId,
        academicYearId: context.academicYearId,
      },
      ...STUDENT_GRADES_ENROLLMENT_ARGS,
    });
  }

  private async listAllocatedSubjectIds(
    context: StudentAppContext,
  ): Promise<string[]> {
    if (!context.termId) return [];

    const rows = await this.scopedPrisma.teacherSubjectAllocation.findMany({
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
      distinct: ['subjectId'],
      select: { subjectId: true },
    });

    return rows.map((row) => row.subjectId);
  }
}

function buildAssessmentWhere(params: {
  context: StudentAppContext;
  enrollment: StudentGradesEnrollmentRecord;
  subjectIds: string[];
  query?: Pick<StudentGradesQueryDto, 'subjectId' | 'type' | 'status'>;
}): Prisma.GradeAssessmentWhereInput {
  const section = params.enrollment.classroom.section;
  const grade = section.grade;
  const stage = grade.stage;
  const requestedSubjectIds = params.query?.subjectId
    ? params.subjectIds.filter((subjectId) => subjectId === params.query?.subjectId)
    : params.subjectIds;

  return {
    academicYearId: params.context.academicYearId,
    termId: params.context.termId ?? undefined,
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

function buildAssessmentStatusWhere(
  status?: StudentGradeAssessmentStatus,
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
  type: StudentGradeAssessmentType,
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
