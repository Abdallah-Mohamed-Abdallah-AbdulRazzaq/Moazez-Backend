import { Injectable } from '@nestjs/common';
import { Prisma, type GradeScoringSuggestion } from '@prisma/client';
import {
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { requireGradesScope } from '../../grades-context';
import {
  evaluateGradeObjectiveAnswer,
  GRADE_SCORING_POLICY_VERSION,
  GRADE_SCORING_VERSION,
} from '../domain/grade-objective-scoring';
import { gradeReviewFingerprint } from '../domain/grade-review-fingerprint';
import { GradeReviewConflictException } from '../domain/grade-review-policy';
import type {
  GradeReviewerActor,
  GradeReviewAnswerResource,
} from '../domain/grade-reviewer-actor';
import type { EvaluationOutcome } from '../../../../common/question-evaluation';
import type {
  ApplyGradeScoringSuggestionDto,
  GradeScoringSuggestionResponseDto,
} from '../dto/grade-review.dto';
import {
  GradesSubmissionsRepository,
  type GradeSubmissionDetailRecord,
} from './grades-submissions.repository';
import {
  currentGradeKeyApproval,
  GRADE_KEY_SNAPSHOT_SELECT,
  gradeKeyQuestionFingerprint,
  recordGradeReviewAudit,
} from './grade-key-approvals.repository';

@Injectable()
export class GradeScoringRepository {
  constructor(private readonly submissions: GradesSubmissionsRepository) {}

  private async current(
    tx: Prisma.TransactionClient,
    resource: GradeReviewAnswerResource,
    submission: GradeSubmissionDetailRecord,
  ) {
    const scope = requireGradesScope();
    const answer = await tx.gradeSubmissionAnswer.findFirst({
      where: {
        id: resource.answerId,
        submissionId: resource.submissionId,
        assessmentId: resource.assessmentId,
        studentId: submission.studentId,
        schoolId: scope.schoolId,
      },
      include: {
        selectedOptions: {
          select: { optionId: true },
          orderBy: { optionId: 'asc' },
        },
      },
    });
    if (!answer) throw new NotFoundDomainException();
    const question = await tx.gradeAssessmentQuestion.findFirst({
      where: {
        id: answer.questionId,
        assessmentId: resource.assessmentId,
        schoolId: scope.schoolId,
      },
      select: GRADE_KEY_SNAPSHOT_SELECT,
    });
    if (!question) throw new NotFoundDomainException();
    const total = await tx.gradeAssessmentQuestion.aggregate({
      where: { assessmentId: resource.assessmentId },
      _sum: { points: true },
    });
    if (
      !total._sum.points?.equals(submission.assessment.maxScore) ||
      question.points.lessThanOrEqualTo(0) ||
      (answer.maxPoints && !answer.maxPoints.equals(question.points))
    )
      throw new ValidationDomainException(
        'Assessment and canonical question points must agree',
      );
    const approval = await currentGradeKeyApproval(tx, question);
    const questionFingerprint = gradeKeyQuestionFingerprint(question);
    const answerFingerprint = gradeReviewFingerprint({
      id: answer.id,
      questionId: answer.questionId,
      submissionId: answer.submissionId,
      answerText: answer.answerText,
      reviewerComment: answer.reviewerComment,
      reviewerCommentAr: answer.reviewerCommentAr,
      answerJson: answer.answerJson,
      selectedOptionIds: answer.selectedOptions.map(
        (option) => option.optionId,
      ),
      correctionStatus: answer.correctionStatus,
      awardedPoints: answer.awardedPoints?.toFixed(2) ?? null,
      maxPoints: answer.maxPoints?.toFixed(2) ?? null,
      reviewedById: answer.reviewedById,
      reviewedAt: answer.reviewedAt?.toISOString() ?? null,
      updatedAt: answer.updatedAt.toISOString(),
    });
    const [nullFact] = await tx.$queryRaw<
      Array<{ sqlNull: boolean }>
    >`SELECT answer_json IS NULL AS "sqlNull" FROM grade_submission_answers WHERE id=${answer.id}::uuid AND school_id=${scope.schoolId}::uuid AND submission_id=${submission.id}::uuid`;
    return {
      answer,
      question,
      approval,
      questionFingerprint,
      answerFingerprint,
      answerJsonSqlNull: nullFact?.sqlNull === true,
    };
  }

  async evaluate(
    actor: GradeReviewerActor,
    resource: GradeReviewAnswerResource,
  ) {
    return this.submissions.withReviewerTransaction(
      actor,
      resource,
      async (tx, submission) => {
        const current = await this.current(tx, resource, submission);
        const fingerprint = gradeReviewFingerprint({
          question: current.questionFingerprint,
          answer: current.answerFingerprint,
          approvalId: current.approval?.id ?? null,
          evaluationVersion: GRADE_SCORING_VERSION,
          policyVersion: GRADE_SCORING_POLICY_VERSION,
        });
        const existing = await tx.gradeScoringSuggestion.findFirst({
          where: { answerId: resource.answerId, fingerprint },
        });
        if (existing)
          return this.present(existing, this.applicability(existing, current));
        const result = evaluateGradeObjectiveAnswer(
          { ...current.question, points: current.question.points.toFixed(2) },
          {
            answerText: current.answer.answerText,
            answerJson: current.answer.answerJson,
            answerJsonSqlNull: current.answerJsonSqlNull,
            selectedOptionIds: current.answer.selectedOptions.map(
              (option) => option.optionId,
            ),
          },
          !!current.approval,
        );
        const scope = requireGradesScope();
        const suggestion = await tx.gradeScoringSuggestion.create({
          data: {
            schoolId: scope.schoolId,
            answerId: current.answer.id,
            submissionId: submission.id,
            assessmentId: resource.assessmentId,
            questionId: current.question.id,
            studentId: submission.studentId,
            keyApprovalId: current.approval?.id ?? null,
            questionFingerprint: current.questionFingerprint,
            answerFingerprint: current.answerFingerprint,
            fingerprint,
            evaluationVersion: result.evaluationVersion,
            policyVersion: result.policyVersion,
            outcome: result.outcome,
            reason: result.reason,
            suggestedPoints:
              result.suggestedPoints === null
                ? null
                : new Prisma.Decimal(result.suggestedPoints),
            maxPoints: new Prisma.Decimal(result.maxPoints),
            manualReviewRequired: result.manualReviewRequired,
            evaluatedById: scope.actorId,
          },
        });
        await recordGradeReviewAudit(
          tx,
          'grades.scoring.evaluate',
          'grade_submission_answer',
          resource.answerId,
          null,
          {
            suggestionId: suggestion.id,
            evaluationVersion: result.evaluationVersion,
            policyVersion: result.policyVersion,
            outcome: result.outcome,
            reason: result.reason,
            manualReviewRequired: result.manualReviewRequired,
          },
        );
        return this.present(
          suggestion,
          this.applicability(suggestion, current),
        );
      },
    );
  }

  async get(
    actor: GradeReviewerActor,
    resource: GradeReviewAnswerResource,
    suggestionId: string,
  ) {
    return this.submissions.withReviewerTransaction(
      actor,
      resource,
      async (tx, submission) => {
        const suggestion = await this.find(tx, resource, suggestionId);
        if (suggestion.appliedAt) return this.present(suggestion, 'APPLIED');
        return this.present(
          suggestion,
          this.applicability(
            suggestion,
            await this.current(tx, resource, submission),
          ),
        );
      },
      true,
    );
  }

  async apply(
    actor: GradeReviewerActor,
    resource: GradeReviewAnswerResource,
    suggestionId: string,
    command: ApplyGradeScoringSuggestionDto,
  ) {
    return this.submissions.withReviewerTransaction(
      actor,
      resource,
      async (tx, submission) => {
        const suggestion = await this.find(tx, resource, suggestionId);
        if (suggestion.appliedAt)
          throw new GradeReviewConflictException('already_applied');
        const current = await this.current(tx, resource, submission);
        const applicability = this.applicability(suggestion, current);
        if (applicability === 'STALE')
          throw new GradeReviewConflictException('stale_suggestion');
        let points: Prisma.Decimal;
        if (command.mode === 'APPLY') {
          if (
            command.awardedPoints !== undefined ||
            command.reason !== undefined ||
            applicability !== 'PENDING' ||
            !suggestion.suggestedPoints
          )
            throw new GradeReviewConflictException('manual_decision_required');
          points = suggestion.suggestedPoints;
        } else if (command.mode === 'OVERRIDE') {
          if (
            command.awardedPoints === undefined ||
            !Number.isFinite(command.awardedPoints) ||
            !['REVIEWER_JUDGMENT', 'PARTIAL_CREDIT', 'KEY_ISSUE'].includes(
              command.reason ?? '',
            )
          )
            throw new GradeReviewConflictException('manual_decision_required');
          points = new Prisma.Decimal(command.awardedPoints);
          if (points.decimalPlaces() > 2)
            throw new ValidationDomainException(
              'Awarded points permit at most two decimal places',
            );
        } else
          throw new GradeReviewConflictException('manual_decision_required');
        if (points.isNegative() || points.greaterThan(current.question.points))
          throw new ValidationDomainException(
            'Awarded points must be within the current question maximum',
          );
        const scope = requireGradesScope();
        const now = new Date();
        await this.submissions.writeReviewerDecision(tx, submission, {
          submissionId: submission.id,
          answerId: current.answer.id,
          awardedPoints: points,
          correctionStatus: 'CORRECTED',
          reviewerComment: current.answer.reviewerComment,
          reviewerCommentAr: current.answer.reviewerCommentAr,
          reviewedById: scope.actorId,
          reviewedAt: now,
        });
        const updated = await tx.gradeScoringSuggestion.update({
          where: { id: suggestion.id },
          data: {
            appliedAt: now,
            appliedById: scope.actorId,
            appliedPoints: points,
            decision: command.mode,
            overrideReason: command.mode === 'OVERRIDE' ? command.reason : null,
            previousAwardedPoints: current.answer.awardedPoints,
          },
        });
        await recordGradeReviewAudit(
          tx,
          command.mode === 'OVERRIDE'
            ? 'grades.scoring.override'
            : 'grades.scoring.apply',
          'grade_submission_answer',
          resource.answerId,
          {
            awardedPoints: current.answer.awardedPoints?.toFixed(2) ?? null,
            correctionStatus: current.answer.correctionStatus,
          },
          {
            suggestionId,
            awardedPoints: points.toFixed(2),
            decision: command.mode,
            reason: command.reason ?? 'CURRENT_DETERMINISTIC_SUGGESTION',
          },
        );
        return this.present(updated, 'APPLIED');
      },
    );
  }

  private async find(
    tx: Prisma.TransactionClient,
    resource: GradeReviewAnswerResource,
    suggestionId: string,
  ) {
    const suggestion = await tx.gradeScoringSuggestion.findFirst({
      where: {
        id: suggestionId,
        answerId: resource.answerId,
        submissionId: resource.submissionId,
        assessmentId: resource.assessmentId,
      },
    });
    if (!suggestion) throw new NotFoundDomainException();
    return suggestion;
  }

  private applicability(
    suggestion: GradeScoringSuggestion,
    current: Awaited<ReturnType<GradeScoringRepository['current']>>,
  ): GradeScoringSuggestionResponseDto['applicability'] {
    if (suggestion.appliedAt) return 'APPLIED';
    if (
      suggestion.questionFingerprint !== current.questionFingerprint ||
      suggestion.answerFingerprint !== current.answerFingerprint ||
      suggestion.keyApprovalId !== (current.approval?.id ?? null) ||
      suggestion.evaluationVersion !== GRADE_SCORING_VERSION ||
      suggestion.policyVersion !== GRADE_SCORING_POLICY_VERSION
    )
      return 'STALE';
    return suggestion.manualReviewRequired ||
      current.answer.correctionStatus === 'CORRECTED'
      ? 'MANUAL_ONLY'
      : 'PENDING';
  }

  private present(
    suggestion: GradeScoringSuggestion,
    applicability: GradeScoringSuggestionResponseDto['applicability'],
  ): GradeScoringSuggestionResponseDto {
    return {
      id: suggestion.id,
      assessmentId: suggestion.assessmentId,
      submissionId: suggestion.submissionId,
      answerId: suggestion.answerId,
      questionId: suggestion.questionId,
      evaluationVersion: suggestion.evaluationVersion,
      policyVersion: suggestion.policyVersion,
      outcome: suggestion.outcome as EvaluationOutcome,
      suggestedPoints: suggestion.suggestedPoints?.toNumber() ?? null,
      maxPoints: suggestion.maxPoints.toNumber(),
      reason: suggestion.reason,
      manualReviewRequired: suggestion.manualReviewRequired,
      applicability,
      evaluatedAt: suggestion.createdAt.toISOString(),
      appliedAt: suggestion.appliedAt?.toISOString() ?? null,
      appliedPoints: suggestion.appliedPoints?.toNumber() ?? null,
      decision: suggestion.decision,
    };
  }
}
