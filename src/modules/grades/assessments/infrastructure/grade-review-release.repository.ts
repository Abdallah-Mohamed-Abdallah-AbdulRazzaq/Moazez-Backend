import { GRADE_RELEASED_ANSWER_SELECT } from './grade-review-read.select';
import { presentReleasedGradeReviewQuestion } from '../presenters/grade-released-review.presenter';
import { Injectable } from '@nestjs/common';
import { GradeQuestionType, Prisma } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { presentQuestionGroupContext } from '../../../../common/question-groups/question-group.projection';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { requireGradesScope } from '../../grades-context';
import { sanitizeGradeQuestionContent } from '../domain/grade-question-content-policy';
import { gradeScoringKey } from '../domain/grade-objective-scoring';
import {
  effectiveGradeReviewLevel,
  GradeReviewConflictException,
  gradeReviewApproved,
  gradeReviewFinalized,
  type GradeReviewAudience,
} from '../domain/grade-review-policy';
import type {
  GradeReleasedReviewQuestionDto,
  SetGradeReviewReleaseDto,
} from '../dto/grade-review.dto';
import { attachGradeReviewDisclosure } from '../domain/grade-review-disclosure';
import { GradeAssetsRepository } from './grade-assets.repository';
import {
  currentGradeKeyApproval,
  GRADE_KEY_SNAPSHOT_SELECT,
  recordGradeReviewAudit,
} from './grade-key-approvals.repository';
import {
  assertGradeReviewAudienceResource,
  type GradeReviewAudienceResource,
} from './grade-review-audience.authorization';
import { projectGradeRichContent } from './grade-rich-content.projection';
import { projectGradeAnswerNullFacts } from './grade-typed-answer.projection';
import {
  assertGradeLiveMutationPermission,
  lockGradeAssessmentMutation,
} from './grades-resource-access';
import { QUESTION_FOR_SUBMISSION_ARGS } from './grades-submissions.repository';

const releaseState = {
  id: true,
  studentId: true,
  status: true,
  correctedAt: true,
  reviewedById: true,
  totalScore: true,
  maxScore: true,
  assessment: { select: { id: true, approvalStatus: true, approvedAt: true } },
} satisfies Prisma.GradeSubmissionSelect;

@Injectable()
export class GradeReviewReleaseRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: GradeAssetsRepository,
  ) {}
  private get scoped() {
    return this.prisma.scoped as unknown as PrismaService;
  }

  private async manager(tx: Prisma.TransactionClient, assessmentId: string) {
    if (
      !['SCHOOL_USER', 'ORGANIZATION_USER'].includes(
        requireGradesScope().userType,
      )
    )
      throw new NotFoundDomainException();
    await assertGradeLiveMutationPermission(tx, 'grades.assessments.approve');
    await lockGradeAssessmentMutation(tx, assessmentId);
    const assessment = await tx.gradeAssessment.findFirst({
      where: { id: assessmentId, deliveryMode: 'QUESTION_BASED' },
      select: { id: true, approvalStatus: true, approvedAt: true },
    });
    if (!assessment) throw new NotFoundDomainException();
    return assessment;
  }

  async policy(assessmentId: string) {
    return this.scoped.$transaction(async (tx) => {
      await this.manager(tx, assessmentId);
      return this.presentPolicy(
        assessmentId,
        await tx.gradeReviewReleasePolicy.findFirst({
          where: { assessmentId },
        }),
      );
    });
  }

  async setPolicy(assessmentId: string, input: SetGradeReviewReleaseDto) {
    const requestId = input.requestId.toLowerCase();
    return this.scoped.$transaction(
      async (tx) => {
        const assessment = await this.manager(tx, assessmentId);
        const prior = await tx.gradeReviewReleasePolicy.findFirst({
          where: { assessmentId },
        });
        if (
          prior?.lastRequestId === requestId &&
          prior.version === input.expectedVersion + 1 &&
          prior.studentLevel === input.studentLevel &&
          prior.parentLevel === input.parentLevel
        )
          return this.presentPolicy(assessmentId, prior);
        if (
          (prior?.version ?? 0) !== input.expectedVersion ||
          prior?.lastRequestId === requestId
        )
          throw new GradeReviewConflictException('stale_version');
        if (input.studentLevel !== 'NONE' || input.parentLevel !== 'NONE') {
          if (!gradeReviewApproved(assessment))
            throw new GradeReviewConflictException('not_approved');
          const submissions = await tx.gradeSubmission.findMany({
            where: { assessmentId },
            select: { status: true, correctedAt: true, reviewedById: true },
          });
          if (
            !submissions.length ||
            submissions.some((submission) => !gradeReviewFinalized(submission))
          )
            throw new GradeReviewConflictException('not_finalized');
          if (input.studentLevel === 'KEYS' || input.parentLevel === 'KEYS')
            await this.assertKeysApproved(tx, assessmentId);
        }
        const data = {
          studentLevel: input.studentLevel,
          parentLevel: input.parentLevel,
          version: input.expectedVersion + 1,
          lastRequestId: requestId,
          changedById: requireGradesScope().actorId,
        };
        const next = prior
          ? await tx.gradeReviewReleasePolicy.update({
              where: { id: prior.id },
              data,
            })
          : await tx.gradeReviewReleasePolicy.create({
              data: {
                ...data,
                schoolId: requireGradesScope().schoolId,
                assessmentId,
              },
            });
        await recordGradeReviewAudit(
          tx,
          'grades.review.release.change',
          'grade_assessment',
          assessmentId,
          this.presentPolicy(assessmentId, prior),
          this.presentPolicy(assessmentId, next),
        );
        return this.presentPolicy(assessmentId, next);
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }

  private async assertKeysApproved(
    tx: Prisma.TransactionClient,
    assessmentId: string,
  ) {
    const questions = await tx.gradeAssessmentQuestion.findMany({
      where: { assessmentId },
      select: GRADE_KEY_SNAPSHOT_SELECT,
      take: 201,
    });
    if (!questions.length || questions.length > 200)
      throw new GradeReviewConflictException('key_not_approved');
    const nulls = await tx.$queryRaw<
      Array<{ id: string; sqlNull: boolean }>
    >`SELECT id, answer_key IS NULL AS "sqlNull" FROM grade_assessment_questions WHERE assessment_id=${assessmentId}::uuid AND school_id=${requireGradesScope().schoolId}::uuid AND deleted_at IS NULL`;
    for (const question of questions) {
      const choice = [
        GradeQuestionType.MCQ_SINGLE,
        GradeQuestionType.MCQ_MULTI,
        GradeQuestionType.TRUE_FALSE,
      ].some((type) => type === question.type);
      if (
        !choice &&
        nulls.find((row) => row.id === question.id)?.sqlNull === true
      )
        continue;
      try {
        gradeScoringKey(question);
      } catch {
        throw new GradeReviewConflictException('key_not_approved');
      }
      if (!(await currentGradeKeyApproval(tx, question)))
        throw new GradeReviewConflictException('key_not_approved');
    }
  }

  /** Used by every released projection and every resource-bound media read. */
  async authorizeRead(
    tx: Prisma.TransactionClient,
    audience: GradeReviewAudience,
    input: GradeReviewAudienceResource,
    requireDetails = true,
  ) {
    const identity = await assertGradeReviewAudienceResource(
      tx,
      audience,
      input,
    );
    const submission = await tx.gradeSubmission.findFirst({
      where: { id: identity.id, assessmentId: input.assessmentId },
      select: releaseState,
    });
    if (!submission) throw new NotFoundDomainException();
    const policy = await tx.gradeReviewReleasePolicy.findFirst({
      where: { assessmentId: input.assessmentId },
    });
    const level = effectiveGradeReviewLevel({
      audience,
      assessment: submission.assessment,
      submission,
      policy,
    });
    if (requireDetails && level === 'NONE') throw new NotFoundDomainException();
    return { submission, level, policyVersion: policy?.version ?? 0 };
  }

  async authorizeMedia(
    tx: Prisma.TransactionClient,
    audience: GradeReviewAudience,
    input: GradeReviewAudienceResource,
  ) {
    const state = await this.authorizeRead(tx, audience, input);
    if (
      audience === 'PARENT' &&
      !(
        await tx.schoolAssessmentMediaPolicy.findFirst({
          select: { allowGuardianVisibility: true },
        })
      )?.allowGuardianVisibility
    )
      throw new NotFoundDomainException();
    return state;
  }

  async markLegacyStudentDisclosure(
    record: { id: string },
    assessmentId: string,
  ): Promise<void> {
    attachGradeReviewDisclosure(record, false);
    try {
      await this.scoped.$transaction(async (tx) => {
        const state = await this.authorizeRead(
          tx,
          'STUDENT',
          { assessmentId, submissionId: record.id },
          false,
        );
        attachGradeReviewDisclosure(record, state.level !== 'NONE');
      });
    } catch (error) {
      if (!(error instanceof NotFoundDomainException)) throw error;
    }
  }

  async read(
    audience: GradeReviewAudience,
    input: GradeReviewAudienceResource,
  ) {
    return this.scoped.$transaction(
      async (tx) => {
        const { submission, level, policyVersion } = await this.authorizeRead(
          tx,
          audience,
          input,
        );
        if (level === 'NONE') throw new NotFoundDomainException();
        const includeMedia =
          audience === 'STUDENT' ||
          !!(
            await tx.schoolAssessmentMediaPolicy.findFirst({
              select: { allowGuardianVisibility: true },
            })
          )?.allowGuardianVisibility;
        const questions = await tx.gradeAssessmentQuestion.findMany({
          where: { assessmentId: input.assessmentId },
          ...QUESTION_FOR_SUBMISSION_ARGS,
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          take: 201,
        });
        if (questions.length > 200) throw new NotFoundDomainException();
        // No key, explanation, option correctness or arbitrary nested Prisma relation is selected here.
        const answers = await tx.gradeSubmissionAnswer.findMany({
          where: {
            submissionId: submission.id,
            assessmentId: input.assessmentId,
          },
          select: GRADE_RELEASED_ANSWER_SELECT,
        });
        await projectGradeAnswerNullFacts(
          tx,
          answers,
          new Map(questions.map((question) => [question.id, question.type])),
        );
        await projectGradeRichContent(
          tx,
          input.assessmentId,
          questions,
          this.assets,
          'student',
          includeMedia,
        );
        const publicQuestions: GradeReleasedReviewQuestionDto[] = [];
        for (const question of questions) {
          const answer = answers.find((row) => row.questionId === question.id);
          let keyProjection: Pick<
            GradeReleasedReviewQuestionDto,
            | 'correctAnswerAvailable'
            | 'correctAnswer'
            | 'explanation'
            | 'explanationAr'
          > = { correctAnswerAvailable: false };
          if (level === 'KEYS') {
            const privateQuestion = await tx.gradeAssessmentQuestion.findFirst({
              where: { id: question.id, assessmentId: input.assessmentId },
              select: GRADE_KEY_SNAPSHOT_SELECT,
            });
            if (
              privateQuestion &&
              (await currentGradeKeyApproval(tx, privateQuestion))
            ) {
              try {
                keyProjection = {
                  correctAnswerAvailable: true,
                  correctAnswer: gradeScoringKey(privateQuestion),
                  explanation: sanitizeGradeQuestionContent(
                    privateQuestion.explanation,
                  ) as string | null,
                  explanationAr: sanitizeGradeQuestionContent(
                    privateQuestion.explanationAr,
                  ) as string | null,
                };
              } catch {
                /* A corrupt historical key has no disclosure projection. */
              }
            }
          }
          publicQuestions.push(
            presentReleasedGradeReviewQuestion(question, answer, keyProjection),
          );
        }
        return {
          assessmentId: input.assessmentId,
          submissionId: submission.id,
          studentId: submission.studentId,
          audience,
          level,
          policyVersion,
          correctedAt: submission.correctedAt!.toISOString(),
          totalScore: submission.totalScore?.toNumber() ?? null,
          maxScore: submission.maxScore?.toNumber() ?? null,
          questions: publicQuestions,
          ...presentQuestionGroupContext(questions),
        };
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }

  private presentPolicy(
    assessmentId: string,
    policy: {
      version: number;
      studentLevel: string;
      parentLevel: string;
      updatedAt: Date;
    } | null,
  ) {
    return {
      assessmentId,
      version: policy?.version ?? 0,
      studentLevel: policy?.studentLevel ?? 'NONE',
      parentLevel: policy?.parentLevel ?? 'NONE',
      updatedAt: policy?.updatedAt.toISOString() ?? null,
    };
  }
}
