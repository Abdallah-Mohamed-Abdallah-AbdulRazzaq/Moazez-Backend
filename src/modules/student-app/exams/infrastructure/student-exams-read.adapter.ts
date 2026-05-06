import { Injectable } from '@nestjs/common';
import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeAssessmentType,
  GradeScopeType,
  GradeSubmissionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { StudentAppContext } from '../../shared/student-app.types';
import type { StudentExamStatus, StudentExamType, StudentExamsQueryDto } from '../dto/student-exams.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const EXAM_TYPES = [
  GradeAssessmentType.QUIZ,
  GradeAssessmentType.MONTH_EXAM,
  GradeAssessmentType.MIDTERM,
  GradeAssessmentType.TERM_EXAM,
  GradeAssessmentType.FINAL,
];

const STUDENT_EXAMS_ENROLLMENT_ARGS =
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

const STUDENT_EXAM_CARD_ARGS =
  Prisma.validator<Prisma.GradeAssessmentDefaultArgs>()({
    select: {
      id: true,
      subjectId: true,
      titleEn: true,
      titleAr: true,
      type: true,
      deliveryMode: true,
      date: true,
      maxScore: true,
      expectedTimeMinutes: true,
      approvalStatus: true,
      lockedAt: true,
      subject: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
        },
      },
      _count: {
        select: {
          questions: {
            where: { deletedAt: null },
          },
        },
      },
    },
  });

const STUDENT_EXAM_DETAIL_ARGS =
  Prisma.validator<Prisma.GradeAssessmentDefaultArgs>()({
    select: {
      id: true,
      subjectId: true,
      titleEn: true,
      titleAr: true,
      type: true,
      deliveryMode: true,
      date: true,
      maxScore: true,
      expectedTimeMinutes: true,
      approvalStatus: true,
      lockedAt: true,
      subject: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
        },
      },
      questions: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          type: true,
          prompt: true,
          promptAr: true,
          points: true,
          sortOrder: true,
          required: true,
          options: {
            where: { deletedAt: null },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              label: true,
              labelAr: true,
              value: true,
              sortOrder: true,
            },
          },
        },
      },
    },
  });

const STUDENT_EXAM_SUBMISSION_LIST_ARGS =
  Prisma.validator<Prisma.GradeSubmissionDefaultArgs>()({
    select: {
      id: true,
      assessmentId: true,
      status: true,
    },
  });

const STUDENT_EXAM_SUBMISSION_DETAIL_ARGS =
  Prisma.validator<Prisma.GradeSubmissionDefaultArgs>()({
    select: {
      id: true,
      assessmentId: true,
      status: true,
      startedAt: true,
      submittedAt: true,
      correctedAt: true,
      totalScore: true,
      maxScore: true,
      answers: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          questionId: true,
          answerText: true,
          answerJson: true,
          correctionStatus: true,
          awardedPoints: true,
          maxPoints: true,
          reviewerComment: true,
          reviewerCommentAr: true,
          reviewedAt: true,
          question: {
            select: {
              id: true,
              type: true,
            },
          },
          selectedOptions: {
            orderBy: [{ createdAt: 'asc' }, { optionId: 'asc' }],
            select: {
              optionId: true,
              option: {
                select: {
                  id: true,
                  label: true,
                  labelAr: true,
                  value: true,
                },
              },
            },
          },
        },
      },
    },
  });

export type StudentExamsEnrollmentRecord = Prisma.EnrollmentGetPayload<
  typeof STUDENT_EXAMS_ENROLLMENT_ARGS
>;
export type StudentExamCardRecord = Prisma.GradeAssessmentGetPayload<
  typeof STUDENT_EXAM_CARD_ARGS
>;
export type StudentExamDetailRecord = Prisma.GradeAssessmentGetPayload<
  typeof STUDENT_EXAM_DETAIL_ARGS
>;
export type StudentExamSubmissionListRecord = Prisma.GradeSubmissionGetPayload<
  typeof STUDENT_EXAM_SUBMISSION_LIST_ARGS
>;
export type StudentExamSubmissionDetailRecord = Prisma.GradeSubmissionGetPayload<
  typeof STUDENT_EXAM_SUBMISSION_DETAIL_ARGS
>;

export interface StudentExamsReadResult {
  exams: StudentExamCardRecord[];
  submissionsByAssessmentId: Map<string, StudentExamSubmissionListRecord>;
  page: number;
  limit: number;
  total: number;
}

export interface StudentExamDetailReadResult {
  exam: StudentExamDetailRecord;
  submission: StudentExamSubmissionListRecord | null;
}

export interface StudentExamSubmissionReadResult {
  exam: StudentExamDetailRecord;
  submission: StudentExamSubmissionDetailRecord | null;
}

@Injectable()
export class StudentExamsReadAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async listExams(params: {
    context: StudentAppContext;
    query?: StudentExamsQueryDto;
  }): Promise<StudentExamsReadResult> {
    const enrollment = await this.findEnrollmentContext(params.context);
    const subjectIds = await this.listAllocatedSubjectIds(params.context);
    const page = resolvePage(params.query?.page);
    const limit = resolveLimit(params.query?.limit, DEFAULT_LIMIT);

    if (!params.context.termId || subjectIds.length === 0) {
      return {
        exams: [],
        submissionsByAssessmentId: new Map(),
        page,
        limit,
        total: 0,
      };
    }

    const exams = await this.scopedPrisma.gradeAssessment.findMany({
      where: buildExamAssessmentWhere({
        context: params.context,
        enrollment,
        subjectIds,
        query: params.query,
      }),
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      ...STUDENT_EXAM_CARD_ARGS,
    });
    const submissions = await this.listSubmissionsForAssessments({
      context: params.context,
      assessmentIds: exams.map((exam) => exam.id),
    });
    const submissionsByAssessmentId = new Map(
      submissions.map((submission) => [submission.assessmentId, submission]),
    );
    const filtered = params.query?.status
      ? exams.filter(
          (exam) =>
            presentSubmissionStatus(
              submissionsByAssessmentId.get(exam.id)?.status ?? null,
            ) === params.query?.status,
        )
      : exams;
    const paged = filtered.slice((page - 1) * limit, page * limit);

    return {
      exams: paged,
      submissionsByAssessmentId,
      page,
      limit,
      total: filtered.length,
    };
  }

  async findExam(params: {
    context: StudentAppContext;
    assessmentId: string;
  }): Promise<StudentExamDetailReadResult | null> {
    const enrollment = await this.findEnrollmentContext(params.context);
    const subjectIds = await this.listAllocatedSubjectIds(params.context);
    if (!params.context.termId || subjectIds.length === 0) return null;

    const exam = await this.scopedPrisma.gradeAssessment.findFirst({
      where: {
        ...buildExamAssessmentWhere({
          context: params.context,
          enrollment,
          subjectIds,
        }),
        id: params.assessmentId,
      },
      ...STUDENT_EXAM_DETAIL_ARGS,
    });

    if (!exam) return null;

    const submission = await this.scopedPrisma.gradeSubmission.findFirst({
      where: {
        assessmentId: exam.id,
        studentId: params.context.studentId,
        enrollmentId: params.context.enrollmentId,
      },
      ...STUDENT_EXAM_SUBMISSION_LIST_ARGS,
    });

    return { exam, submission };
  }

  async findExamSubmission(params: {
    context: StudentAppContext;
    assessmentId: string;
  }): Promise<StudentExamSubmissionReadResult | null> {
    const detail = await this.findExam(params);
    if (!detail) return null;

    const submission = await this.scopedPrisma.gradeSubmission.findFirst({
      where: {
        assessmentId: detail.exam.id,
        studentId: params.context.studentId,
        enrollmentId: params.context.enrollmentId,
      },
      ...STUDENT_EXAM_SUBMISSION_DETAIL_ARGS,
    });

    return {
      exam: detail.exam,
      submission,
    };
  }

  private findEnrollmentContext(
    context: StudentAppContext,
  ): Promise<StudentExamsEnrollmentRecord> {
    return this.scopedPrisma.enrollment.findFirstOrThrow({
      where: {
        id: context.enrollmentId,
        studentId: context.studentId,
        academicYearId: context.academicYearId,
      },
      ...STUDENT_EXAMS_ENROLLMENT_ARGS,
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

  private listSubmissionsForAssessments(params: {
    context: StudentAppContext;
    assessmentIds: string[];
  }): Promise<StudentExamSubmissionListRecord[]> {
    if (params.assessmentIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.gradeSubmission.findMany({
      where: {
        assessmentId: { in: params.assessmentIds },
        studentId: params.context.studentId,
        enrollmentId: params.context.enrollmentId,
      },
      ...STUDENT_EXAM_SUBMISSION_LIST_ARGS,
    });
  }
}

function buildExamAssessmentWhere(params: {
  context: StudentAppContext;
  enrollment: StudentExamsEnrollmentRecord;
  subjectIds: string[];
  query?: Pick<StudentExamsQueryDto, 'subjectId' | 'type'>;
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
    type: params.query?.type
      ? toCoreExamType(params.query.type)
      : { in: EXAM_TYPES },
    deliveryMode: {
      in: [
        GradeAssessmentDeliveryMode.SCORE_ONLY,
        GradeAssessmentDeliveryMode.QUESTION_BASED,
      ],
    },
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

function toCoreExamType(type: StudentExamType): GradeAssessmentType {
  switch (type) {
    case 'quiz':
      return GradeAssessmentType.QUIZ;
    case 'month_exam':
      return GradeAssessmentType.MONTH_EXAM;
    case 'midterm':
      return GradeAssessmentType.MIDTERM;
    case 'term_exam':
      return GradeAssessmentType.TERM_EXAM;
    case 'final':
      return GradeAssessmentType.FINAL;
  }
}

function presentSubmissionStatus(
  status: GradeSubmissionStatus | null,
): StudentExamStatus {
  switch (status) {
    case GradeSubmissionStatus.IN_PROGRESS:
      return 'in_progress';
    case GradeSubmissionStatus.SUBMITTED:
    case GradeSubmissionStatus.CORRECTED:
      return 'completed';
    case null:
      return 'not_started';
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
