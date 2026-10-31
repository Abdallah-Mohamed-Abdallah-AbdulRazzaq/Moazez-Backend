import { QuestionEvaluationInputError } from '../../../../common/question-evaluation';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getRequestContext } from '../../../../common/context/request-context';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { requireGradesScope } from '../../grades-context';
import { gradeReviewFingerprint } from '../domain/grade-review-fingerprint';
import { GradeReviewConflictException } from '../domain/grade-review-policy';
import { gradeScoringKey } from '../domain/grade-objective-scoring';
import {
  assertGradeLiveMutationPermission,
  lockGradeAssessmentMutation,
} from './grades-resource-access';

/** Private selection: only management approval, reviewer evaluation or released-key reads. */
export const GRADE_KEY_SNAPSHOT_SELECT = {
  id: true,
  schoolId: true,
  assessmentId: true,
  type: true,
  prompt: true,
  promptAr: true,
  points: true,
  answerKey: true,
  metadata: true,
  responseConfig: true,
  explanation: true,
  explanationAr: true,
  updatedAt: true,
  options: {
    where: { deletedAt: null },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      label: true,
      labelAr: true,
      value: true,
      isCorrect: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.GradeAssessmentQuestionSelect;

export type GradeKeySnapshot = Prisma.GradeAssessmentQuestionGetPayload<{
  select: typeof GRADE_KEY_SNAPSHOT_SELECT;
}>;

export function gradeKeyQuestionFingerprint(
  question: GradeKeySnapshot,
): string {
  return gradeReviewFingerprint({
    id: question.id,
    schoolId: question.schoolId,
    assessmentId: question.assessmentId,
    type: question.type,
    prompt: question.prompt,
    promptAr: question.promptAr,
    explanation: question.explanation,
    explanationAr: question.explanationAr,
    points: question.points.toFixed(2),
    updatedAt: question.updatedAt.toISOString(),
    metadata: question.metadata,
    answerKey: question.answerKey,
    responseConfig: question.responseConfig,
    options: question.options.map((option) => ({
      ...option,
      updatedAt: option.updatedAt.toISOString(),
    })),
  });
}

export async function currentGradeKeyApproval(
  tx: Prisma.TransactionClient,
  question: GradeKeySnapshot,
) {
  return tx.gradeQuestionKeyApproval.findFirst({
    where: {
      schoolId: question.schoolId,
      assessmentId: question.assessmentId,
      questionId: question.id,
      questionFingerprint: gradeKeyQuestionFingerprint(question),
      revokedAt: null,
    },
    select: { id: true, createdAt: true, keyVersion: true },
  });
}

/** Audit values exclude answer/key values and fingerprints, including hash-oracle material. */
export async function recordGradeReviewAudit(
  tx: Prisma.TransactionClient,
  action: string,
  resourceType: string,
  resourceId: string,
  before: Prisma.InputJsonObject | null,
  after: Prisma.InputJsonObject,
) {
  const scope = requireGradesScope();
  await tx.auditLog.create({
    data: {
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'grades',
      action,
      resourceType,
      resourceId,
      outcome: 'SUCCESS',
      ...(before ? { before } : {}),
      after: { ...after, requestId: getRequestContext()?.requestId ?? null },
    },
  });
}

@Injectable()
export class GradeKeyApprovalsRepository {
  constructor(private readonly prisma: PrismaService) {}
  private get scoped() {
    return this.prisma.scoped as unknown as PrismaService;
  }

  private async authorize(tx: Prisma.TransactionClient, assessmentId: string) {
    if (
      !['SCHOOL_USER', 'ORGANIZATION_USER'].includes(
        requireGradesScope().userType,
      )
    )
      throw new NotFoundDomainException();
    await assertGradeLiveMutationPermission(tx, 'grades.questions.manage');
    await assertGradeLiveMutationPermission(tx, 'grades.assessments.approve');
    await lockGradeAssessmentMutation(tx, assessmentId);
    const assessment = await tx.gradeAssessment.findFirst({
      where: { id: assessmentId, deliveryMode: 'QUESTION_BASED' },
      select: { id: true },
    });
    if (!assessment) throw new NotFoundDomainException();
  }

  async approve(
    assessmentId: string,
    questionId: string,
    expectedQuestionUpdatedAt: string,
  ) {
    return this.scoped.$transaction(
      async (tx) => {
        await this.authorize(tx, assessmentId);
        const question = await tx.gradeAssessmentQuestion.findFirst({
          where: { id: questionId, assessmentId },
          select: GRADE_KEY_SNAPSHOT_SELECT,
        });
        if (!question) throw new NotFoundDomainException();
        if (
          question.updatedAt.getTime() !==
          new Date(expectedQuestionUpdatedAt).getTime()
        )
          throw new GradeReviewConflictException('stale_version');
        try {
          gradeScoringKey(question);
        } catch (error) {
          if (error instanceof QuestionEvaluationInputError)
            throw new ValidationDomainException(
              'Answer key is not valid for this question',
            );
          throw error;
        }
        const fingerprint = gradeKeyQuestionFingerprint(question);
        const active = await tx.gradeQuestionKeyApproval.findFirst({
          where: { questionId, assessmentId, revokedAt: null },
        });
        if (active?.questionFingerprint === fingerprint)
          return this.present(active);
        const scope = requireGradesScope();
        if (active)
          await tx.gradeQuestionKeyApproval.update({
            where: { id: active.id },
            data: { revokedAt: new Date(), revokedById: scope.actorId },
          });
        const approval = await tx.gradeQuestionKeyApproval.create({
          data: {
            schoolId: scope.schoolId,
            assessmentId,
            questionId,
            questionFingerprint: fingerprint,
            approvedById: scope.actorId,
          },
        });
        await recordGradeReviewAudit(
          tx,
          'grades.question.key.approve',
          'grade_assessment_question',
          questionId,
          active ? { approvalId: active.id } : null,
          {
            approvalId: approval.id,
            questionUpdatedAt: question.updatedAt.toISOString(),
            keyVersion: 1,
          },
        );
        return this.present(approval);
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }

  async revoke(assessmentId: string, questionId: string, approvalId: string) {
    return this.scoped.$transaction(
      async (tx) => {
        await this.authorize(tx, assessmentId);
        const approval = await tx.gradeQuestionKeyApproval.findFirst({
          where: { id: approvalId, assessmentId, questionId },
        });
        if (!approval) throw new NotFoundDomainException();
        if (approval.revokedAt) return this.present(approval);
        const updated = await tx.gradeQuestionKeyApproval.update({
          where: { id: approvalId },
          data: {
            revokedAt: new Date(),
            revokedById: requireGradesScope().actorId,
          },
        });
        await recordGradeReviewAudit(
          tx,
          'grades.question.key.revoke',
          'grade_assessment_question',
          questionId,
          { approvalId, revoked: false },
          { approvalId, revoked: true },
        );
        return this.present(updated);
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }

  private present(approval: {
    id: string;
    questionId: string;
    createdAt: Date;
    revokedAt: Date | null;
  }) {
    return {
      id: approval.id,
      questionId: approval.questionId,
      approvedAt: approval.createdAt.toISOString(),
      revokedAt: approval.revokedAt?.toISOString() ?? null,
      keyVersion: 1 as const,
    };
  }
}
