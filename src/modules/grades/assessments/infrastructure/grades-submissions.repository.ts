import { Injectable } from '@nestjs/common';
import {
  GradeAnswerCorrectionStatus,
  GradeSubmissionStatus,
  Prisma,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import {
  NormalizedAnswerPayload,
  SubmissionAssessmentLike,
} from '../domain/grade-submission-domain';

const STUDENT_SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  status: true,
} satisfies Prisma.StudentSelect;

const CLASSROOM_SUMMARY_SELECT = {
  id: true,
  nameAr: true,
  nameEn: true,
  sectionId: true,
  section: {
    select: {
      id: true,
      nameAr: true,
      nameEn: true,
      gradeId: true,
      grade: {
        select: {
          id: true,
          nameAr: true,
          nameEn: true,
          stageId: true,
        },
      },
    },
  },
} satisfies Prisma.ClassroomSelect;

const ENROLLMENT_SUMMARY_ARGS =
  Prisma.validator<Prisma.EnrollmentDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      studentId: true,
      academicYearId: true,
      termId: true,
      classroomId: true,
      status: true,
      enrolledAt: true,
      endedAt: true,
      classroom: {
        select: CLASSROOM_SUMMARY_SELECT,
      },
    },
  });

const ASSESSMENT_FOR_SUBMISSION_ARGS =
  Prisma.validator<Prisma.GradeAssessmentDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      academicYearId: true,
      termId: true,
      subjectId: true,
      scopeType: true,
      scopeKey: true,
      stageId: true,
      gradeId: true,
      sectionId: true,
      classroomId: true,
      titleEn: true,
      titleAr: true,
      deliveryMode: true,
      approvalStatus: true,
      lockedAt: true,
      maxScore: true,
      deletedAt: true,
      term: {
        select: {
          id: true,
          academicYearId: true,
          startDate: true,
          endDate: true,
          isActive: true,
        },
      },
    },
  });

const QUESTION_FOR_SUBMISSION_ARGS =
  Prisma.validator<Prisma.GradeAssessmentQuestionDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      assessmentId: true,
      type: true,
      prompt: true,
      promptAr: true,
      points: true,
      sortOrder: true,
      required: true,
      deletedAt: true,
      options: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          questionId: true,
          label: true,
          labelAr: true,
          value: true,
          sortOrder: true,
          deletedAt: true,
        },
      },
    },
  });

const SELECTED_ANSWER_OPTION_SELECT = {
  schoolId: true,
  answerId: true,
  optionId: true,
  createdAt: true,
  option: {
    select: {
      id: true,
      questionId: true,
      label: true,
      labelAr: true,
      value: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.GradeSubmissionAnswerOptionSelect;

const ANSWER_WITH_OPTIONS_ARGS =
  Prisma.validator<Prisma.GradeSubmissionAnswerDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      submissionId: true,
      assessmentId: true,
      questionId: true,
      studentId: true,
      answerText: true,
      answerJson: true,
      correctionStatus: true,
      awardedPoints: true,
      maxPoints: true,
      reviewerComment: true,
      reviewerCommentAr: true,
      reviewedById: true,
      reviewedAt: true,
      createdAt: true,
      updatedAt: true,
      question: {
        select: {
          id: true,
          assessmentId: true,
          type: true,
          points: true,
          deletedAt: true,
        },
      },
      selectedOptions: {
        orderBy: [{ createdAt: 'asc' }, { optionId: 'asc' }],
        select: SELECTED_ANSWER_OPTION_SELECT,
      },
    },
  });

const SUBMISSION_DETAIL_ARGS =
  Prisma.validator<Prisma.GradeSubmissionDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      assessmentId: true,
      termId: true,
      studentId: true,
      enrollmentId: true,
      status: true,
      startedAt: true,
      submittedAt: true,
      correctedAt: true,
      reviewedById: true,
      totalScore: true,
      maxScore: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      assessment: {
        select: ASSESSMENT_FOR_SUBMISSION_ARGS.select,
      },
      student: {
        select: STUDENT_SUMMARY_SELECT,
      },
      enrollment: {
        select: ENROLLMENT_SUMMARY_ARGS.select,
      },
      answers: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: ANSWER_WITH_OPTIONS_ARGS.select,
      },
    },
  });

const SUBMISSION_LIST_ARGS =
  Prisma.validator<Prisma.GradeSubmissionDefaultArgs>()({
    select: {
      id: true,
      schoolId: true,
      assessmentId: true,
      termId: true,
      studentId: true,
      enrollmentId: true,
      status: true,
      startedAt: true,
      submittedAt: true,
      correctedAt: true,
      totalScore: true,
      maxScore: true,
      createdAt: true,
      updatedAt: true,
      student: {
        select: STUDENT_SUMMARY_SELECT,
      },
      enrollment: {
        select: ENROLLMENT_SUMMARY_ARGS.select,
      },
      answers: {
        select: {
          id: true,
          questionId: true,
          answerText: true,
          answerJson: true,
          correctionStatus: true,
          selectedOptions: {
            select: {
              optionId: true,
            },
          },
        },
      },
    },
  });

const OPTION_FOR_ANSWER_SELECT = {
  id: true,
  schoolId: true,
  assessmentId: true,
  questionId: true,
  label: true,
  labelAr: true,
  value: true,
  deletedAt: true,
} satisfies Prisma.GradeAssessmentQuestionOptionSelect;

export type GradeSubmissionAssessmentRecord = Prisma.GradeAssessmentGetPayload<
  typeof ASSESSMENT_FOR_SUBMISSION_ARGS
>;
export type GradeSubmissionEnrollmentRecord = Prisma.EnrollmentGetPayload<
  typeof ENROLLMENT_SUMMARY_ARGS
>;
export type GradeSubmissionStudentRecord = Prisma.StudentGetPayload<{
  select: typeof STUDENT_SUMMARY_SELECT;
}>;
export type GradeSubmissionQuestionRecord =
  Prisma.GradeAssessmentQuestionGetPayload<typeof QUESTION_FOR_SUBMISSION_ARGS>;
export type GradeSubmissionOptionRecord =
  Prisma.GradeAssessmentQuestionOptionGetPayload<{
    select: typeof OPTION_FOR_ANSWER_SELECT;
  }>;
export type GradeSubmissionAnswerRecord =
  Prisma.GradeSubmissionAnswerGetPayload<typeof ANSWER_WITH_OPTIONS_ARGS>;
export type GradeSubmissionDetailRecord = Prisma.GradeSubmissionGetPayload<
  typeof SUBMISSION_DETAIL_ARGS
>;
export type GradeSubmissionListRecord = Prisma.GradeSubmissionGetPayload<
  typeof SUBMISSION_LIST_ARGS
>;

export interface ListGradeSubmissionsFilters {
  status?: GradeSubmissionStatus;
  classroomId?: string;
  sectionId?: string;
  gradeId?: string;
  search?: string;
}

export interface CreateSubmissionInput {
  schoolId: string;
  assessmentId: string;
  termId: string;
  studentId: string;
  enrollmentId: string;
  maxScore: Prisma.Decimal;
}

export interface AnswerSaveInput {
  schoolId: string;
  submissionId: string;
  assessmentId: string;
  studentId: string;
  questionId: string;
  maxPoints: Prisma.Decimal;
  payload: NormalizedAnswerPayload;
}

export interface AnswerReviewUpdateInput {
  answerId: string;
  submissionId: string;
  awardedPoints: Prisma.Decimal;
  correctionStatus: GradeAnswerCorrectionStatus;
  reviewerComment: string | null;
  reviewerCommentAr: string | null;
  reviewedById: string | null;
  reviewedAt: Date;
}

export interface FinalizeSubmissionInput {
  submissionId: string;
  status: GradeSubmissionStatus;
  correctedAt: Date;
  reviewedById: string | null;
  totalScore: Prisma.Decimal;
  maxScore: Prisma.Decimal;
}

@Injectable()
export class GradesSubmissionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  findAssessmentForSubmission(
    assessmentId: string,
  ): Promise<GradeSubmissionAssessmentRecord | null> {
    return this.scopedPrisma.gradeAssessment.findFirst({
      where: { id: assessmentId },
      ...ASSESSMENT_FOR_SUBMISSION_ARGS,
    });
  }

  findStudentForSubmission(
    studentId: string,
  ): Promise<GradeSubmissionStudentRecord | null> {
    return this.scopedPrisma.student.findFirst({
      where: { id: studentId, status: StudentStatus.ACTIVE },
      select: STUDENT_SUMMARY_SELECT,
    });
  }

  findEnrollmentForSubmission(params: {
    assessment: SubmissionAssessmentLike;
    studentId: string;
    enrollmentId?: string | null;
  }): Promise<GradeSubmissionEnrollmentRecord | null> {
    return this.scopedPrisma.enrollment.findFirst({
      where: {
        ...this.buildEnrollmentScopeWhere({
          assessment: params.assessment,
          studentId: params.studentId,
        }),
        ...(params.enrollmentId ? { id: params.enrollmentId } : {}),
      },
      orderBy: [{ enrolledAt: 'desc' }, { createdAt: 'desc' }],
      ...ENROLLMENT_SUMMARY_ARGS,
    });
  }

  findExistingSubmission(params: {
    assessmentId: string;
    studentId: string;
  }): Promise<GradeSubmissionDetailRecord | null> {
    return this.scopedPrisma.gradeSubmission.findFirst({
      where: {
        assessmentId: params.assessmentId,
        studentId: params.studentId,
        assessment: { deletedAt: null },
      },
      ...SUBMISSION_DETAIL_ARGS,
    });
  }

  async createSubmission(
    input: CreateSubmissionInput,
  ): Promise<GradeSubmissionDetailRecord> {
    const created = await this.scopedPrisma.gradeSubmission.create({
      data: {
        schoolId: input.schoolId,
        assessmentId: input.assessmentId,
        termId: input.termId,
        studentId: input.studentId,
        enrollmentId: input.enrollmentId,
        status: GradeSubmissionStatus.IN_PROGRESS,
        startedAt: new Date(),
        maxScore: input.maxScore,
      },
      select: { id: true },
    });

    return this.findSubmissionDetailResult(created.id);
  }

  listSubmissions(params: {
    assessmentId: string;
    filters?: ListGradeSubmissionsFilters;
  }): Promise<GradeSubmissionListRecord[]> {
    return this.scopedPrisma.gradeSubmission.findMany({
      where: this.buildSubmissionListWhere(params.assessmentId, params.filters),
      orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
      ...SUBMISSION_LIST_ARGS,
    });
  }

  findSubmissionDetail(
    submissionId: string,
  ): Promise<GradeSubmissionDetailRecord | null> {
    return this.scopedPrisma.gradeSubmission.findFirst({
      where: { id: submissionId, assessment: { deletedAt: null } },
      ...SUBMISSION_DETAIL_ARGS,
    });
  }

  findSubmissionForReview(
    submissionId: string,
  ): Promise<GradeSubmissionDetailRecord | null> {
    return this.findSubmissionDetail(submissionId);
  }

  findQuestionForAnswer(
    questionId: string,
  ): Promise<GradeSubmissionQuestionRecord | null> {
    return this.scopedPrisma.gradeAssessmentQuestion.findFirst({
      where: { id: questionId },
      ...QUESTION_FOR_SUBMISSION_ARGS,
    });
  }

  findAnswerForReview(
    answerId: string,
  ): Promise<GradeSubmissionAnswerRecord | null> {
    return this.scopedPrisma.gradeSubmissionAnswer.findFirst({
      where: { id: answerId },
      ...ANSWER_WITH_OPTIONS_ARGS,
    });
  }

  findAnswersForBulkReview(
    answerIds: string[],
  ): Promise<GradeSubmissionAnswerRecord[]> {
    if (answerIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.gradeSubmissionAnswer.findMany({
      where: { id: { in: answerIds } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...ANSWER_WITH_OPTIONS_ARGS,
    });
  }

  findQuestionsForSubmission(
    assessmentId: string,
  ): Promise<GradeSubmissionQuestionRecord[]> {
    return this.scopedPrisma.gradeAssessmentQuestion.findMany({
      where: { assessmentId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      ...QUESTION_FOR_SUBMISSION_ARGS,
    });
  }

  listActiveQuestionsForSubmission(
    assessmentId: string,
  ): Promise<GradeSubmissionQuestionRecord[]> {
    return this.findQuestionsForSubmission(assessmentId);
  }

  listAnswersForSubmission(
    submissionId: string,
  ): Promise<GradeSubmissionAnswerRecord[]> {
    return this.scopedPrisma.gradeSubmissionAnswer.findMany({
      where: { submissionId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...ANSWER_WITH_OPTIONS_ARGS,
    });
  }

  findQuestionsByIds(
    questionIds: string[],
  ): Promise<GradeSubmissionQuestionRecord[]> {
    if (questionIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.gradeAssessmentQuestion.findMany({
      where: { id: { in: questionIds } },
      ...QUESTION_FOR_SUBMISSION_ARGS,
    });
  }

  findOptionsForQuestion(
    questionId: string,
  ): Promise<GradeSubmissionOptionRecord[]> {
    return this.scopedPrisma.gradeAssessmentQuestionOption.findMany({
      where: { questionId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: OPTION_FOR_ANSWER_SELECT,
    });
  }

  findOptionsByIds(
    optionIds: string[],
  ): Promise<GradeSubmissionOptionRecord[]> {
    if (optionIds.length === 0) return Promise.resolve([]);

    return this.scopedPrisma.gradeAssessmentQuestionOption.findMany({
      where: { id: { in: optionIds } },
      select: OPTION_FOR_ANSWER_SELECT,
    });
  }

  async upsertAnswerWithSelectedOptions(
    input: AnswerSaveInput,
  ): Promise<GradeSubmissionAnswerRecord> {
    const answerId = await this.scopedPrisma.$transaction(async (tx) => {
      const answer = await tx.gradeSubmissionAnswer.upsert({
        where: {
          schoolId_submissionId_questionId: {
            schoolId: input.schoolId,
            submissionId: input.submissionId,
            questionId: input.questionId,
          },
        },
        create: this.buildAnswerCreateInput(input),
        update: this.buildAnswerUpdateInput(input),
        select: { id: true },
      });

      await this.replaceSelectedOptions(tx, {
        schoolId: input.schoolId,
        answerId: answer.id,
        optionIds: input.payload.selectedOptionIds,
      });

      return answer.id;
    });

    return this.findAnswerResult(answerId);
  }

  async bulkUpsertAnswersWithSelectedOptions(
    inputs: AnswerSaveInput[],
  ): Promise<GradeSubmissionAnswerRecord[]> {
    if (inputs.length === 0) return [];

    const answerIds = await this.scopedPrisma.$transaction(async (tx) => {
      const savedAnswerIds: string[] = [];

      for (const input of inputs) {
        const answer = await tx.gradeSubmissionAnswer.upsert({
          where: {
            schoolId_submissionId_questionId: {
              schoolId: input.schoolId,
              submissionId: input.submissionId,
              questionId: input.questionId,
            },
          },
          create: this.buildAnswerCreateInput(input),
          update: this.buildAnswerUpdateInput(input),
          select: { id: true },
        });

        await this.replaceSelectedOptions(tx, {
          schoolId: input.schoolId,
          answerId: answer.id,
          optionIds: input.payload.selectedOptionIds,
        });
        savedAnswerIds.push(answer.id);
      }

      return savedAnswerIds;
    });

    return this.scopedPrisma.gradeSubmissionAnswer.findMany({
      where: { id: { in: answerIds } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...ANSWER_WITH_OPTIONS_ARGS,
    });
  }

  async updateAnswerReview(
    input: AnswerReviewUpdateInput,
  ): Promise<GradeSubmissionAnswerRecord> {
    await this.scopedPrisma.gradeSubmissionAnswer.updateMany({
      where: {
        id: input.answerId,
        submissionId: input.submissionId,
      },
      data: {
        awardedPoints: input.awardedPoints,
        correctionStatus: input.correctionStatus,
        reviewerComment: input.reviewerComment,
        reviewerCommentAr: input.reviewerCommentAr,
        reviewedById: input.reviewedById,
        reviewedAt: input.reviewedAt,
      },
    });

    return this.findAnswerResult(input.answerId);
  }

  async bulkUpdateAnswerReviews(
    inputs: AnswerReviewUpdateInput[],
  ): Promise<GradeSubmissionAnswerRecord[]> {
    if (inputs.length === 0) return [];

    const answerIds = await this.scopedPrisma.$transaction(async (tx) => {
      const updatedAnswerIds: string[] = [];

      for (const input of inputs) {
        await tx.gradeSubmissionAnswer.updateMany({
          where: {
            id: input.answerId,
            submissionId: input.submissionId,
          },
          data: {
            awardedPoints: input.awardedPoints,
            correctionStatus: input.correctionStatus,
            reviewerComment: input.reviewerComment,
            reviewerCommentAr: input.reviewerCommentAr,
            reviewedById: input.reviewedById,
            reviewedAt: input.reviewedAt,
          },
        });
        updatedAnswerIds.push(input.answerId);
      }

      return updatedAnswerIds;
    });

    return this.scopedPrisma.gradeSubmissionAnswer.findMany({
      where: { id: { in: answerIds } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...ANSWER_WITH_OPTIONS_ARGS,
    });
  }

  async submitSubmission(
    submissionId: string,
  ): Promise<GradeSubmissionDetailRecord> {
    await this.scopedPrisma.gradeSubmission.updateMany({
      where: { id: submissionId, status: GradeSubmissionStatus.IN_PROGRESS },
      data: {
        status: GradeSubmissionStatus.SUBMITTED,
        submittedAt: new Date(),
      },
    });

    return this.findSubmissionDetailResult(submissionId);
  }

  async finalizeSubmission(
    input: FinalizeSubmissionInput,
  ): Promise<GradeSubmissionDetailRecord> {
    await this.scopedPrisma.gradeSubmission.updateMany({
      where: {
        id: input.submissionId,
        status: GradeSubmissionStatus.SUBMITTED,
      },
      data: {
        status: input.status,
        correctedAt: input.correctedAt,
        reviewedById: input.reviewedById,
        totalScore: input.totalScore,
        maxScore: input.maxScore,
      },
    });

    return this.findSubmissionDetailResult(input.submissionId);
  }

  countGradeItemsForAssessment(assessmentId: string): Promise<number> {
    return this.scopedPrisma.gradeItem.count({
      where: { assessmentId },
    });
  }

  private async findAnswerResult(
    answerId: string,
  ): Promise<GradeSubmissionAnswerRecord> {
    const answer = await this.scopedPrisma.gradeSubmissionAnswer.findFirst({
      where: { id: answerId },
      ...ANSWER_WITH_OPTIONS_ARGS,
    });

    if (!answer) {
      throw new Error('Grade submission answer mutation result was not found');
    }

    return answer;
  }

  private async findSubmissionDetailResult(
    submissionId: string,
  ): Promise<GradeSubmissionDetailRecord> {
    const submission = await this.findSubmissionDetail(submissionId);
    if (!submission) {
      throw new Error('Grade submission mutation result was not found');
    }

    return submission;
  }

  private buildSubmissionListWhere(
    assessmentId: string,
    filters?: ListGradeSubmissionsFilters,
  ): Prisma.GradeSubmissionWhereInput {
    const search = filters?.search?.trim();

    return {
      assessmentId,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(search
        ? {
            student: {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
      ...(this.hasPlacementFilters(filters)
        ? {
            enrollment: {
              classroom: this.buildListFilterClassroomWhere(filters),
            },
          }
        : {}),
    };
  }

  private buildEnrollmentScopeWhere(params: {
    assessment: SubmissionAssessmentLike;
    studentId: string;
  }): Prisma.EnrollmentWhereInput {
    return {
      studentId: params.studentId,
      academicYearId: params.assessment.academicYearId,
      status: StudentEnrollmentStatus.ACTIVE,
      OR: [{ termId: params.assessment.termId }, { termId: null }],
      student: {
        status: StudentStatus.ACTIVE,
        deletedAt: null,
      },
      classroom: this.buildAssessmentRosterClassroomWhere(params.assessment),
    };
  }

  private buildAssessmentRosterClassroomWhere(
    assessment: SubmissionAssessmentLike,
  ): Prisma.ClassroomWhereInput {
    switch (assessment.scopeType) {
      case 'SCHOOL':
        return { deletedAt: null };
      case 'STAGE':
        return {
          deletedAt: null,
          section: {
            deletedAt: null,
            grade: {
              deletedAt: null,
              stageId: assessment.stageId ?? assessment.scopeKey,
            },
          },
        };
      case 'GRADE':
        return {
          deletedAt: null,
          section: {
            deletedAt: null,
            gradeId: assessment.gradeId ?? assessment.scopeKey,
          },
        };
      case 'SECTION':
        return {
          deletedAt: null,
          sectionId: assessment.sectionId ?? assessment.scopeKey,
        };
      case 'CLASSROOM':
        return {
          deletedAt: null,
          id: assessment.classroomId ?? assessment.scopeKey,
        };
      default:
        return { id: '__invalid_scope__' };
    }
  }

  private buildListFilterClassroomWhere(
    filters?: Pick<
      ListGradeSubmissionsFilters,
      'classroomId' | 'sectionId' | 'gradeId'
    >,
  ): Prisma.ClassroomWhereInput {
    const and: Prisma.ClassroomWhereInput[] = [];

    if (filters?.classroomId) {
      and.push({ id: filters.classroomId });
    }

    if (filters?.sectionId) {
      and.push({ sectionId: filters.sectionId });
    }

    if (filters?.gradeId) {
      and.push({ section: { gradeId: filters.gradeId } });
    }

    return and.length > 0 ? { AND: and } : {};
  }

  private hasPlacementFilters(
    filters?: Pick<
      ListGradeSubmissionsFilters,
      'classroomId' | 'sectionId' | 'gradeId'
    >,
  ): boolean {
    return Boolean(
      filters?.classroomId || filters?.sectionId || filters?.gradeId,
    );
  }

  private buildAnswerCreateInput(
    input: AnswerSaveInput,
  ): Prisma.GradeSubmissionAnswerUncheckedCreateInput {
    return {
      schoolId: input.schoolId,
      submissionId: input.submissionId,
      assessmentId: input.assessmentId,
      questionId: input.questionId,
      studentId: input.studentId,
      answerText: input.payload.answerText,
      answerJson: this.toNullableJson(input.payload.answerJson),
      correctionStatus: GradeAnswerCorrectionStatus.PENDING,
      awardedPoints: null,
      maxPoints: input.maxPoints,
    };
  }

  private buildAnswerUpdateInput(
    input: AnswerSaveInput,
  ): Prisma.GradeSubmissionAnswerUncheckedUpdateInput {
    return {
      answerText: input.payload.answerText,
      answerJson: this.toNullableJson(input.payload.answerJson),
      correctionStatus: GradeAnswerCorrectionStatus.PENDING,
      awardedPoints: null,
      maxPoints: input.maxPoints,
      reviewedById: null,
      reviewedAt: null,
      reviewerComment: null,
      reviewerCommentAr: null,
    };
  }

  private async replaceSelectedOptions(
    tx: Prisma.TransactionClient,
    params: {
      schoolId: string;
      answerId: string;
      optionIds: string[];
    },
  ): Promise<void> {
    await tx.gradeSubmissionAnswerOption.deleteMany({
      where: {
        schoolId: params.schoolId,
        answerId: params.answerId,
      },
    });

    if (params.optionIds.length === 0) return;

    await tx.gradeSubmissionAnswerOption.createMany({
      data: params.optionIds.map((optionId) => ({
        schoolId: params.schoolId,
        answerId: params.answerId,
        optionId,
      })),
    });
  }

  private toNullableJson(value: unknown): Prisma.InputJsonValue {
    if (value === null || value === undefined) {
      return Prisma.JsonNull as unknown as Prisma.InputJsonValue;
    }

    return value as Prisma.InputJsonValue;
  }
}
