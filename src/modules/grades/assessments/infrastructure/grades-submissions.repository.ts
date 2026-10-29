import { GradeAssetsRepository } from './grade-assets.repository';
import { isGradeEvaluationType } from '../domain/grade-question-evaluation';
import { gradeQuestionDefinition } from '../domain/grade-question-interaction';
import { projectGradeAnswerNullFacts } from './grade-typed-answer.projection';
import { assertGradeRuntimeQuestionType } from '../domain/grade-runtime-types';
import {
  authorizeGradeRichReview,
  hasGradeRichSelection,
  projectGradeRichContent,
} from './grade-rich-content.projection';
import {
  assertGradeSubmissionAccess,
  assertGradeLiveMutationPermission,
  gradeAssessmentAccessWhere,
  gradeSubmissionAccessWhere,
  gradeStudentAccessWhere,
  gradeEnrollmentAccessWhere,
} from './grades-resource-access';
import { Injectable } from '@nestjs/common';
import {
  GradeAnswerCorrectionStatus,
  GradeSubmissionStatus,
  Prisma,
  StudentEnrollmentStatus,
  StudentStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { requireGradesScope } from '../../grades-context';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import {
  NormalizedAnswerPayload,
  SubmissionAssessmentLike,
  assertSubmissionMutable,
  assertSubmissionAssessmentAcceptsDrafts,
  assertRequiredQuestionsAnswered,
  validateAnswerPayloadForQuestion,
  validateStoredAnswerPayloadForQuestion,
  validateSelectedOptionsForQuestion,
  validateEnrollmentWithinAssessmentScope,
} from '../domain/grade-submission-domain';
import {
  assertSubmissionReviewable,
  assertAllRequiredAnswersReviewed,
  assertReviewAwardedPoints,
  calculateSubmissionTotalScore,
} from '../domain/grade-submission-review-domain';

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
      richContent: true,
      points: true,
      sortOrder: true,
      required: true,
      metadata: true,
      deletedAt: true,
      options: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          questionId: true,
          label: true,
          labelAr: true,
          richContent: true,
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
          metadata: true,
          required: true,
          options: QUESTION_FOR_SUBMISSION_ARGS.select.options,
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
  /** Derived again from the locked question; callers cannot choose storage semantics. */
  answerJsonDbNull?: boolean;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly richAssets?: GradeAssetsRepository,
  ) {}

  private get scopedPrisma(): PrismaService {
    return this.prisma.scoped as unknown as PrismaService;
  }

  async findAssessmentForSubmission(
    assessmentId: string,
  ): Promise<GradeSubmissionAssessmentRecord | null> {
    return this.scopedPrisma.gradeAssessment.findFirst({
      where: {
        AND: [
          { id: assessmentId },
          await gradeAssessmentAccessWhere(this.scopedPrisma, true),
        ],
      },
      ...ASSESSMENT_FOR_SUBMISSION_ARGS,
    });
  }

  async findStudentForSubmission(
    studentId: string,
  ): Promise<GradeSubmissionStudentRecord | null> {
    return this.scopedPrisma.student.findFirst({
      where: {
        id: studentId,
        status: StudentStatus.ACTIVE,
        ...gradeStudentAccessWhere(),
      },
      select: STUDENT_SUMMARY_SELECT,
    });
  }

  async findEnrollmentForSubmission(params: {
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
        AND: [
          await gradeEnrollmentAccessWhere(
            this.scopedPrisma,
            params.assessment.id,
          ),
        ],
      },
      orderBy: [{ enrolledAt: 'desc' }, { createdAt: 'desc' }],
      ...ENROLLMENT_SUMMARY_ARGS,
    });
  }

  async findExistingSubmission(params: {
    assessmentId: string;
    studentId: string;
  }): Promise<GradeSubmissionDetailRecord | null> {
    const submission = await this.scopedPrisma.gradeSubmission.findFirst({
      where: {
        assessmentId: params.assessmentId,
        studentId: params.studentId,
        assessment: { deletedAt: null },
        AND: [await gradeSubmissionAccessWhere(this.scopedPrisma)],
      },
      ...SUBMISSION_DETAIL_ARGS,
    });
    if (submission)
      await projectGradeAnswerNullFacts(this.scopedPrisma, submission.answers);
    return submission;
  }

  async findExistingSubmissionForEnrollment(params: {
    assessmentId: string;
    studentId: string;
    enrollmentId: string;
  }): Promise<GradeSubmissionDetailRecord | null> {
    const submission = await this.scopedPrisma.gradeSubmission.findFirst({
      where: {
        assessmentId: params.assessmentId,
        studentId: params.studentId,
        enrollmentId: params.enrollmentId,
        assessment: { deletedAt: null },
        AND: [await gradeSubmissionAccessWhere(this.scopedPrisma)],
      },
      ...SUBMISSION_DETAIL_ARGS,
    });
    if (submission)
      await projectGradeAnswerNullFacts(this.scopedPrisma, submission.answers);
    return submission;
  }

  async createSubmission(
    input: CreateSubmissionInput,
    permission:
      | 'grades.submissions.submit'
      | 'grades.submissions.start' = 'grades.submissions.submit',
  ): Promise<GradeSubmissionDetailRecord> {
    const created = await this.scopedPrisma.$transaction(async (tx) => {
      await assertGradeLiveMutationPermission(tx, permission);
      const access = await gradeAssessmentAccessWhere(tx, true);
      const { schoolId, actorId, userType } = requireGradesScope();
      await tx.$queryRaw`SELECT id FROM grade_assessments WHERE id = ${input.assessmentId}::uuid AND school_id = ${schoolId}::uuid FOR UPDATE`;
      const assessment = await tx.gradeAssessment.findFirst({
        where: { id: input.assessmentId, AND: [access] },
        ...ASSESSMENT_FOR_SUBMISSION_ARGS,
      });
      if (!assessment) throw new NotFoundDomainException();
      assertSubmissionAssessmentAcceptsDrafts(assessment, assessment.term);
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT e.id FROM student_enrollments e JOIN students s ON s.id = e.student_id AND s.school_id = e.school_id
        WHERE e.id = ${input.enrollmentId}::uuid AND e.student_id = ${input.studentId}::uuid AND e.school_id = ${schoolId}::uuid
          AND e.status = 'ACTIVE' AND e.ended_at IS NULL AND e.deleted_at IS NULL AND s.status = 'ACTIVE' AND s.deleted_at IS NULL
          AND (${userType} <> 'STUDENT' OR s.user_id = ${actorId}::uuid) FOR SHARE OF e, s`;
      if (
        !rows.length ||
        input.termId !== assessment.termId ||
        input.schoolId !== schoolId
      )
        throw new NotFoundDomainException();
      const enrollment = await tx.enrollment.findFirst({
        where: { id: input.enrollmentId },
        ...ENROLLMENT_SUMMARY_ARGS,
      });
      if (!enrollment) throw new NotFoundDomainException();
      validateEnrollmentWithinAssessmentScope({ assessment, enrollment });
      const created = await tx.gradeSubmission.create({
        data: {
          schoolId: input.schoolId,
          assessmentId: input.assessmentId,
          termId: input.termId,
          studentId: input.studentId,
          enrollmentId: input.enrollmentId,
          status: GradeSubmissionStatus.IN_PROGRESS,
          startedAt: new Date(),
          maxScore: assessment.maxScore,
        },
        select: { id: true },
      });

      await assertGradeSubmissionAccess(tx, created.id);
      return created;
    });
    return this.findSubmissionDetailResult(created.id);
  }

  async listSubmissions(params: {
    assessmentId: string;
    filters?: ListGradeSubmissionsFilters;
  }): Promise<GradeSubmissionListRecord[]> {
    return this.scopedPrisma.gradeSubmission.findMany({
      where: {
        AND: [
          this.buildSubmissionListWhere(params.assessmentId, params.filters),
          await gradeSubmissionAccessWhere(this.scopedPrisma),
        ],
      },
      orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
      ...SUBMISSION_LIST_ARGS,
    });
  }

  async findSubmissionDetail(
    submissionId: string,
  ): Promise<GradeSubmissionDetailRecord | null> {
    const submission = await this.scopedPrisma.gradeSubmission.findFirst({
      where: {
        id: submissionId,
        assessment: { deletedAt: null },
        AND: [await gradeSubmissionAccessWhere(this.scopedPrisma)],
      },
      ...SUBMISSION_DETAIL_ARGS,
    });
    if (submission)
      await projectGradeAnswerNullFacts(this.scopedPrisma, submission.answers);
    return submission;
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

  async findAnswerForReview(
    answerId: string,
  ): Promise<GradeSubmissionAnswerRecord | null> {
    const answer = await this.scopedPrisma.gradeSubmissionAnswer.findFirst({
      where: {
        id: answerId,
        submission: await gradeSubmissionAccessWhere(this.scopedPrisma),
      },
      ...ANSWER_WITH_OPTIONS_ARGS,
    });
    if (answer) await projectGradeAnswerNullFacts(this.scopedPrisma, [answer]);
    return answer;
  }

  async findAnswersForBulkReview(
    answerIds: string[],
  ): Promise<GradeSubmissionAnswerRecord[]> {
    if (answerIds.length === 0) return Promise.resolve([]);

    const answers = await this.scopedPrisma.gradeSubmissionAnswer.findMany({
      where: {
        id: { in: answerIds },
        submission: await gradeSubmissionAccessWhere(this.scopedPrisma),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...ANSWER_WITH_OPTIONS_ARGS,
    });
    await projectGradeAnswerNullFacts(this.scopedPrisma, answers);
    return answers;
  }

  async findQuestionsForSubmission(
    assessmentId: string,
    questionIds?: string[],
  ): Promise<GradeSubmissionQuestionRecord[]> {
    const questions = await this.scopedPrisma.gradeAssessmentQuestion.findMany({
      where: {
        assessmentId,
        ...(questionIds ? { id: { in: questionIds } } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      ...QUESTION_FOR_SUBMISSION_ARGS,
    });
    // Students receive Rich display through their independently scoped app adapters.
    if (
      requireGradesScope().userType !== 'STUDENT' &&
      hasGradeRichSelection(questions)
    )
      await this.scopedPrisma.$transaction(async (tx) => {
        await authorizeGradeRichReview(tx, assessmentId);
        await projectGradeRichContent(
          tx,
          assessmentId,
          questions,
          this.richAssets,
          'review',
        );
      });
    return questions;
  }

  listActiveQuestionsForSubmission(
    assessmentId: string,
    questionIds?: string[],
  ): Promise<GradeSubmissionQuestionRecord[]> {
    return this.findQuestionsForSubmission(assessmentId, questionIds);
  }

  async listAnswersForSubmission(
    submissionId: string,
  ): Promise<GradeSubmissionAnswerRecord[]> {
    const answers = await this.scopedPrisma.gradeSubmissionAnswer.findMany({
      where: {
        submissionId,
        submission: await gradeSubmissionAccessWhere(this.scopedPrisma),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...ANSWER_WITH_OPTIONS_ARGS,
    });
    await projectGradeAnswerNullFacts(this.scopedPrisma, answers);
    return answers;
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
    permission:
      | 'grades.submissions.submit'
      | 'grades.submissions.save' = 'grades.submissions.submit',
  ): Promise<GradeSubmissionAnswerRecord> {
    const answerId = await this.scopedPrisma.$transaction(async (tx) => {
      const submission = await this.lockSubmissionMutation(
        tx,
        input.submissionId,
        permission,
      );
      input = await this.validateAnswerSave(tx, submission, input);
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
    permission:
      | 'grades.submissions.submit'
      | 'grades.submissions.save' = 'grades.submissions.submit',
  ): Promise<GradeSubmissionAnswerRecord[]> {
    if (inputs.length === 0) return [];

    const answerIds = await this.scopedPrisma.$transaction(async (tx) => {
      const submissions: GradeSubmissionDetailRecord[] = [];
      for (const submissionId of [
        ...new Set(inputs.map((input) => input.submissionId)),
      ].sort()) {
        submissions.push(
          await this.lockSubmissionMutation(tx, submissionId, permission),
        );
      }
      const keys = inputs.map(
        (input) => `${input.submissionId}:${input.questionId}`,
      );
      if (new Set(keys).size !== keys.length)
        throw new ValidationDomainException(
          'Duplicate question ids are not allowed',
          { field: 'answers.questionId' },
        );
      const validated: AnswerSaveInput[] = [];
      for (const input of inputs)
        validated.push(
          await this.validateAnswerSave(
            tx,
            submissions.find(
              (submission) => submission.id === input.submissionId,
            )!,
            input,
          ),
        );
      const savedAnswerIds: string[] = [];

      for (const input of validated) {
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

    const answers = await this.scopedPrisma.gradeSubmissionAnswer.findMany({
      where: {
        id: { in: answerIds },
        submission: await gradeSubmissionAccessWhere(this.scopedPrisma),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...ANSWER_WITH_OPTIONS_ARGS,
    });
    await projectGradeAnswerNullFacts(this.scopedPrisma, answers);
    return answers;
  }

  async updateAnswerReview(
    input: AnswerReviewUpdateInput,
  ): Promise<GradeSubmissionAnswerRecord> {
    await this.scopedPrisma.$transaction(async (tx) => {
      const submission = await this.lockSubmissionMutation(
        tx,
        input.submissionId,
        'grades.submissions.review',
      );
      await this.validateReviewWrite(tx, submission, input);
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
    });

    return this.findAnswerResult(input.answerId);
  }

  async bulkUpdateAnswerReviews(
    inputs: AnswerReviewUpdateInput[],
  ): Promise<GradeSubmissionAnswerRecord[]> {
    if (inputs.length === 0) return [];

    const answerIds = await this.scopedPrisma.$transaction(async (tx) => {
      const submissions: GradeSubmissionDetailRecord[] = [];
      for (const id of [
        ...new Set(inputs.map((input) => input.submissionId)),
      ].sort())
        submissions.push(
          await this.lockSubmissionMutation(
            tx,
            id,
            'grades.submissions.review',
          ),
        );
      if (new Set(inputs.map((input) => input.answerId)).size !== inputs.length)
        throw new ValidationDomainException(
          'Duplicate answer ids are not allowed',
          { field: 'reviews.answerId' },
        );
      for (const input of inputs)
        await this.validateReviewWrite(
          tx,
          submissions.find(
            (submission) => submission.id === input.submissionId,
          )!,
          input,
        );
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

    const answers = await this.scopedPrisma.gradeSubmissionAnswer.findMany({
      where: {
        id: { in: answerIds },
        submission: await gradeSubmissionAccessWhere(this.scopedPrisma),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      ...ANSWER_WITH_OPTIONS_ARGS,
    });
    await projectGradeAnswerNullFacts(this.scopedPrisma, answers);
    return answers;
  }

  async submitSubmission(
    submissionId: string,
  ): Promise<GradeSubmissionDetailRecord> {
    await this.scopedPrisma.$transaction(async (tx) => {
      const submission = await this.lockSubmissionMutation(
        tx,
        submissionId,
        'grades.submissions.submit',
      );
      assertSubmissionMutable(submission);
      assertSubmissionAssessmentAcceptsDrafts(
        submission.assessment,
        submission.assessment.term,
      );
      const questions = await tx.gradeAssessmentQuestion.findMany({
        where: { assessmentId: submission.assessmentId },
        ...QUESTION_FOR_SUBMISSION_ARGS,
      });
      assertRequiredQuestionsAnswered({
        questions,
        answers: submission.answers,
      });
      const nullFacts = await this.validateStoredEvaluationAnswers(
        tx,
        submission,
      );
      for (const answer of submission.answers) {
        const question = questions.find(
          (question) => question.id === answer.questionId,
        );
        if (!question) throw new NotFoundDomainException();
        const payload = validateStoredAnswerPayloadForQuestion({
          question,
          payload: {
            answerText: answer.answerText,
            answerJson: answer.answerJson,
            answerJsonSqlNull: nullFacts.get(answer.id),
            selectedOptionIds: answer.selectedOptions.map(
              (option) => option.optionId,
            ),
          },
        });
        validateSelectedOptionsForQuestion({
          question,
          selectedOptionIds: payload.selectedOptionIds,
          options: question.options,
        });
      }
      await tx.gradeSubmission.updateMany({
        where: { id: submissionId, status: GradeSubmissionStatus.IN_PROGRESS },
        data: {
          status: GradeSubmissionStatus.SUBMITTED,
          submittedAt: new Date(),
        },
      });
    });

    return this.findSubmissionDetailResult(submissionId);
  }

  async finalizeSubmission(
    input: FinalizeSubmissionInput,
  ): Promise<GradeSubmissionDetailRecord> {
    await this.scopedPrisma.$transaction(async (tx) => {
      const submission = await this.lockSubmissionMutation(
        tx,
        input.submissionId,
        'grades.submissions.review',
      );
      assertSubmissionReviewable(submission);
      await this.validateStoredEvaluationAnswers(tx, submission);
      const questions = await tx.gradeAssessmentQuestion.findMany({
        where: { assessmentId: submission.assessmentId },
        ...QUESTION_FOR_SUBMISSION_ARGS,
      });
      assertRequiredQuestionsAnswered({
        questions,
        answers: submission.answers,
      });
      assertAllRequiredAnswersReviewed({
        questions,
        answers: submission.answers,
      });
      input = {
        ...input,
        totalScore: new Prisma.Decimal(
          calculateSubmissionTotalScore({
            questions,
            answers: submission.answers,
          }),
        ),
        maxScore: submission.maxScore ?? submission.assessment.maxScore,
      };
      await tx.gradeSubmission.updateMany({
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
    });

    return this.findSubmissionDetailResult(input.submissionId);
  }

  countGradeItemsForAssessment(assessmentId: string): Promise<number> {
    return this.scopedPrisma.gradeItem.count({
      where: { assessmentId },
    });
  }

  private async lockSubmissionMutation(
    tx: Prisma.TransactionClient,
    submissionId: string,
    permission: string,
  ): Promise<GradeSubmissionDetailRecord> {
    await assertGradeLiveMutationPermission(tx, permission);
    await assertGradeSubmissionAccess(tx, submissionId);
    const reference = await tx.gradeSubmission.findFirst({
      where: { id: submissionId },
      select: { assessmentId: true },
    });
    if (!reference) throw new NotFoundDomainException();
    const { schoolId } = requireGradesScope();
    await tx.$queryRaw`SELECT id FROM grade_assessments WHERE id = ${reference.assessmentId}::uuid AND school_id = ${schoolId}::uuid FOR UPDATE`;
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT g.id FROM grade_submissions g
      JOIN grade_assessments a ON a.id = g.assessment_id AND a.school_id = g.school_id
      JOIN students s ON s.id = g.student_id AND s.school_id = g.school_id
      JOIN student_enrollments e ON e.id = g.enrollment_id AND e.student_id = s.id AND e.school_id = g.school_id
      JOIN subjects su ON su.id = a.subject_id AND su.school_id = g.school_id
      JOIN terms te ON te.id = a.term_id AND te.school_id = g.school_id AND te.academic_year_id = a.academic_year_id
      JOIN academic_years ay ON ay.id = a.academic_year_id AND ay.school_id = g.school_id
      JOIN classrooms c ON c.id = e.classroom_id AND c.school_id = g.school_id
      JOIN sections se ON se.id = c.section_id AND se.school_id = g.school_id
      JOIN grades gr ON gr.id = se.grade_id AND gr.school_id = g.school_id
      JOIN stages st ON st.id = gr.stage_id AND st.school_id = g.school_id
      WHERE g.id = ${submissionId}::uuid AND g.school_id = ${schoolId}::uuid
        AND s.deleted_at IS NULL AND s.status = 'ACTIVE'
        AND e.deleted_at IS NULL AND e.status = 'ACTIVE' AND e.ended_at IS NULL
        AND su.deleted_at IS NULL AND su.is_active = true AND te.deleted_at IS NULL AND ay.deleted_at IS NULL
        AND c.deleted_at IS NULL AND se.deleted_at IS NULL AND gr.deleted_at IS NULL AND st.deleted_at IS NULL
      FOR UPDATE OF g FOR SHARE OF s, e, su, te, ay, c, se, gr, st`;
    if (!rows.length) throw new NotFoundDomainException();
    await assertGradeSubmissionAccess(tx, submissionId);
    const submission = await tx.gradeSubmission.findFirst({
      where: { id: submissionId },
      ...SUBMISSION_DETAIL_ARGS,
    });
    if (!submission || !submission.enrollment)
      throw new NotFoundDomainException();
    validateEnrollmentWithinAssessmentScope({
      assessment: submission.assessment,
      enrollment: submission.enrollment,
    });
    const questionTypes = await tx.gradeAssessmentQuestion.findMany({
      where: {
        assessmentId: submission.assessmentId,
        schoolId,
        deletedAt: null,
      },
      select: {
        type: true,
        metadata: true,
        options: { where: { deletedAt: null }, select: { id: true } },
      },
    });
    for (const question of questionTypes) {
      assertGradeRuntimeQuestionType(question.type);
      if (isGradeEvaluationType(question.type))
        gradeQuestionDefinition(question);
    }
    return submission;
  }

  private async validateAnswerSave(
    tx: Prisma.TransactionClient,
    submission: GradeSubmissionDetailRecord,
    input: AnswerSaveInput,
  ): Promise<AnswerSaveInput> {
    assertSubmissionMutable(submission);
    assertSubmissionAssessmentAcceptsDrafts(
      submission.assessment,
      submission.assessment.term,
    );
    if (
      input.assessmentId !== submission.assessmentId ||
      input.studentId !== submission.studentId ||
      input.schoolId !== submission.schoolId
    )
      throw new NotFoundDomainException();
    const { schoolId } = requireGradesScope();
    await tx.$queryRaw`SELECT id FROM grade_assessment_questions WHERE id = ${input.questionId}::uuid AND assessment_id = ${submission.assessmentId}::uuid AND school_id = ${schoolId}::uuid AND deleted_at IS NULL FOR SHARE`;
    await tx.$queryRaw`SELECT id FROM grade_assessment_question_options WHERE question_id = ${input.questionId}::uuid AND school_id = ${schoolId}::uuid AND deleted_at IS NULL ORDER BY id FOR SHARE`;
    const question = await tx.gradeAssessmentQuestion.findFirst({
      where: { id: input.questionId, assessmentId: submission.assessmentId },
      ...QUESTION_FOR_SUBMISSION_ARGS,
    });
    if (!question) throw new NotFoundDomainException();
    const payload = validateAnswerPayloadForQuestion({
      question,
      payload: input.payload,
    });
    validateSelectedOptionsForQuestion({
      question,
      selectedOptionIds: payload.selectedOptionIds,
      options: question.options,
    });
    return {
      ...input,
      maxPoints: question.points,
      payload,
      answerJsonDbNull:
        isGradeEvaluationType(question.type) && payload.answerJson === null,
    };
  }

  private async validateReviewWrite(
    tx: Prisma.TransactionClient,
    submission: GradeSubmissionDetailRecord,
    input: AnswerReviewUpdateInput,
  ): Promise<void> {
    assertSubmissionReviewable(submission);
    const answer = await tx.gradeSubmissionAnswer.findFirst({
      where: { id: input.answerId, submissionId: submission.id },
      ...ANSWER_WITH_OPTIONS_ARGS,
    });
    if (!answer || answer.question.deletedAt)
      throw new NotFoundDomainException();
    if (isGradeEvaluationType(answer.question.type))
      await this.validateStoredEvaluationAnswers(tx, submission);
    assertReviewAwardedPoints({ answer, awardedPoints: input.awardedPoints });
  }

  /** Existing submission/assessment locks and authorization already hold. No key read. */
  private async validateStoredEvaluationAnswers(
    tx: Prisma.TransactionClient,
    submission: GradeSubmissionDetailRecord,
  ): Promise<Map<string, boolean>> {
    const answers = submission.answers.filter((answer) =>
      isGradeEvaluationType(answer.question.type),
    );
    const facts = new Map<string, boolean>();
    if (!answers.length) return facts;
    const { schoolId } = requireGradesScope();
    const rows = await tx.$queryRaw<Array<{ id: string; sqlNull: boolean }>>`
      SELECT id, answer_json IS NULL AS "sqlNull" FROM grade_submission_answers
      WHERE school_id=${schoolId}::uuid AND submission_id=${submission.id}::uuid
        AND assessment_id=${submission.assessmentId}::uuid`;
    for (const row of rows) facts.set(row.id, row.sqlNull);
    for (const answer of answers)
      validateStoredAnswerPayloadForQuestion({
        question: answer.question,
        payload: {
          answerText: answer.answerText,
          answerJson: answer.answerJson,
          answerJsonSqlNull: facts.get(answer.id),
          selectedOptionIds: answer.selectedOptions.map(
            (option) => option.optionId,
          ),
        },
      });
    return facts;
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
    await projectGradeAnswerNullFacts(this.scopedPrisma, [answer]);
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
      answerJson: input.answerJsonDbNull
        ? Prisma.DbNull
        : this.toNullableJson(input.payload.answerJson),
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
      answerJson: input.answerJsonDbNull
        ? Prisma.DbNull
        : this.toNullableJson(input.payload.answerJson),
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
