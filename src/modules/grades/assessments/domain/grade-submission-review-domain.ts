import { HttpStatus } from '@nestjs/common';
import {
  GradeAnswerCorrectionStatus,
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeSubmissionStatus,
} from '@prisma/client';
import {
  DomainException,
  NotFoundDomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { toGradeNumber } from '../../shared/domain/grade-calculation';
import {
  GradeTermWritableLike,
  assertTermWritable,
  isAssessmentLocked,
  normalizeAssessmentApprovalStatus,
  normalizeDeliveryMode,
} from '../../shared/domain/grade-workflow';
import { GradeAssessmentLockedException } from './grade-assessment-domain';
import {
  GradeAnswerInvalidQuestionException,
  SubmissionAssessmentLike,
  SubmissionQuestionLike,
  normalizeSubmissionStatus,
} from './grade-submission-domain';

export interface ReviewSubmissionLike {
  id: string;
  assessmentId: string;
  studentId: string;
  status: GradeSubmissionStatus | string;
  assessment: SubmissionAssessmentLike & {
    term: GradeTermWritableLike;
    maxScore?: unknown;
  };
}

export interface ReviewAnswerLike {
  id: string;
  submissionId: string;
  assessmentId: string;
  questionId: string;
  studentId: string;
  correctionStatus: GradeAnswerCorrectionStatus | string;
  awardedPoints?: unknown;
  maxPoints?: unknown;
  reviewerComment?: string | null;
  reviewerCommentAr?: string | null;
  reviewedById?: string | null;
  reviewedAt?: Date | string | null;
  question: {
    id: string;
    assessmentId: string;
    type?: unknown;
    points?: unknown;
    deletedAt?: Date | string | null;
  };
}

export interface ReviewCommandLike {
  awardedPoints: unknown;
  reviewerComment?: string | null;
  reviewerCommentAr?: string | null;
}

export interface AnswerReviewPayload {
  awardedPoints: number;
  correctionStatus: GradeAnswerCorrectionStatus;
  reviewerComment: string | null;
  reviewerCommentAr: string | null;
  reviewedById: string | null;
  reviewedAt: Date;
}

export interface FinalizeSubmissionPayload {
  status: GradeSubmissionStatus;
  correctedAt: Date;
  reviewedById: string | null;
  totalScore: number;
  maxScore: number;
}

export class GradeSubmissionNotSubmittedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'grades.submission.not_submitted',
      message: 'Submission must be submitted first',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class GradeReviewAlreadyFinalizedException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'grades.review.already_finalized',
      message: 'Review is already finalized',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export class GradeReviewPendingAnswersException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'grades.review.pending_answers',
      message: 'Review still has pending answers',
      httpStatus: HttpStatus.CONFLICT,
      details,
    });
  }
}

export function assertSubmissionReviewable(
  submission: ReviewSubmissionLike,
): void {
  assertSubmittedForReview(submission);
  assertQuestionBasedPublishedWritableAssessment(submission.assessment);
}

export function assertSubmissionFinalizable(
  submission: ReviewSubmissionLike,
): void {
  assertSubmissionReviewable(submission);
}

export function assertReviewAwardedPoints(params: {
  answer: ReviewAnswerLike;
  awardedPoints: unknown;
}): number {
  const awardedPoints = toReviewNumber(params.awardedPoints);
  const maxPoints = resolveAnswerMaxPoints(params.answer);

  if (
    awardedPoints === null ||
    awardedPoints < 0 ||
    awardedPoints > maxPoints
  ) {
    throw new ValidationDomainException(
      'Awarded points must be between 0 and the answer max points',
      {
        field: 'awardedPoints',
        answerId: params.answer.id,
        awardedPoints: params.awardedPoints,
        maxPoints,
      },
    );
  }

  return awardedPoints;
}

export function assertNoDuplicateReviewAnswerIds(
  reviews: Array<{ answerId: string }>,
): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const review of reviews) {
    if (seen.has(review.answerId)) {
      duplicates.add(review.answerId);
      continue;
    }
    seen.add(review.answerId);
  }

  if (duplicates.size > 0) {
    throw new ValidationDomainException(
      'Duplicate answer ids are not allowed in bulk review',
      {
        field: 'reviews.answerId',
        duplicateAnswerIds: [...duplicates],
      },
    );
  }
}

export function assertAnswerBelongsToSubmission(params: {
  answer: ReviewAnswerLike;
  submission: ReviewSubmissionLike;
}): void {
  if (
    params.answer.submissionId !== params.submission.id ||
    params.answer.assessmentId !== params.submission.assessmentId ||
    params.answer.studentId !== params.submission.studentId
  ) {
    throw new NotFoundDomainException('Grade submission answer not found', {
      answerId: params.answer.id,
      submissionId: params.submission.id,
    });
  }

  assertAnswerQuestionIsActiveForReview(params);
}

export function assertAllRequiredAnswersReviewed(params: {
  questions: SubmissionQuestionLike[];
  answers: ReviewAnswerLike[];
}): void {
  const activeQuestionIds = new Set(
    params.questions.map((question) => question.id),
  );
  const answerByQuestionId = new Map(
    params.answers
      .filter((answer) => activeQuestionIds.has(answer.questionId))
      .map((answer) => [answer.questionId, answer]),
  );
  const missingRequiredQuestionIds: string[] = [];
  const pendingAnswerIds: string[] = [];

  for (const question of params.questions) {
    if (!question.required) continue;

    const answer = answerByQuestionId.get(question.id);
    if (!answer) {
      missingRequiredQuestionIds.push(question.id);
      continue;
    }

    if (!isAnswerCorrected(answer)) {
      pendingAnswerIds.push(answer.id);
    }
  }

  for (const answer of params.answers) {
    if (!activeQuestionIds.has(answer.questionId)) continue;
    if (!isAnswerCorrected(answer)) {
      pendingAnswerIds.push(answer.id);
    }
  }

  const uniquePendingAnswerIds = [...new Set(pendingAnswerIds)];
  if (
    missingRequiredQuestionIds.length > 0 ||
    uniquePendingAnswerIds.length > 0
  ) {
    throw new GradeReviewPendingAnswersException({
      missingRequiredQuestionIds,
      pendingAnswerIds: uniquePendingAnswerIds,
    });
  }
}

export function calculateSubmissionTotalScore(params: {
  questions: SubmissionQuestionLike[];
  answers: ReviewAnswerLike[];
}): number {
  const activeQuestionIds = new Set(
    params.questions.map((question) => question.id),
  );

  return params.answers.reduce((total, answer) => {
    if (!activeQuestionIds.has(answer.questionId)) return total;
    return total + (toReviewNumber(answer.awardedPoints) ?? 0);
  }, 0);
}

export function buildAnswerReviewPayload(params: {
  command: ReviewCommandLike;
  answer: ReviewAnswerLike;
  actorId?: string | null;
  now?: Date;
}): AnswerReviewPayload {
  return {
    awardedPoints: assertReviewAwardedPoints({
      answer: params.answer,
      awardedPoints: params.command.awardedPoints,
    }),
    correctionStatus: GradeAnswerCorrectionStatus.CORRECTED,
    reviewerComment: normalizeNullableText(params.command.reviewerComment),
    reviewerCommentAr: normalizeNullableText(params.command.reviewerCommentAr),
    reviewedById: params.actorId ?? null,
    reviewedAt: params.now ?? new Date(),
  };
}

export function buildFinalizeSubmissionPayload(params: {
  submission: ReviewSubmissionLike;
  totalScore: number;
  actorId?: string | null;
  now?: Date;
}): FinalizeSubmissionPayload {
  return {
    status: GradeSubmissionStatus.CORRECTED,
    correctedAt: params.now ?? new Date(),
    reviewedById: params.actorId ?? null,
    totalScore: params.totalScore,
    maxScore: resolveSubmissionMaxScore(params.submission),
  };
}

function assertSubmittedForReview(submission: ReviewSubmissionLike): void {
  const status = normalizeSubmissionStatus(submission.status);
  if (status === GradeSubmissionStatus.SUBMITTED) return;

  if (status === GradeSubmissionStatus.CORRECTED) {
    throw new GradeReviewAlreadyFinalizedException({
      submissionId: submission.id,
    });
  }

  throw new GradeSubmissionNotSubmittedException({
    submissionId: submission.id,
    status,
  });
}

function assertQuestionBasedPublishedWritableAssessment(
  assessment: ReviewSubmissionLike['assessment'],
): void {
  if (
    normalizeDeliveryMode(assessment.deliveryMode) !==
    GradeAssessmentDeliveryMode.QUESTION_BASED
  ) {
    throw new ValidationDomainException(
      'Assessment must be question-based for review',
      {
        assessmentId: assessment.id,
        deliveryMode: assessment.deliveryMode,
      },
    );
  }

  if (isAssessmentLocked(assessment)) {
    throw new GradeAssessmentLockedException({ assessmentId: assessment.id });
  }

  const approvalStatus = normalizeAssessmentApprovalStatus(
    assessment.approvalStatus,
  );
  if (
    approvalStatus !== GradeAssessmentApprovalStatus.PUBLISHED &&
    approvalStatus !== GradeAssessmentApprovalStatus.APPROVED
  ) {
    throw new DomainException({
      code: 'grades.assessment.not_published',
      message: 'Assessment must be published first',
      httpStatus: HttpStatus.CONFLICT,
      details: { assessmentId: assessment.id, approvalStatus },
    });
  }

  assertTermWritable(assessment.term);
}

function assertAnswerQuestionIsActiveForReview(params: {
  answer: ReviewAnswerLike;
  submission: ReviewSubmissionLike;
}): void {
  const question = params.answer.question;
  if (
    question.deletedAt ||
    question.assessmentId !== params.submission.assessmentId
  ) {
    throw new GradeAnswerInvalidQuestionException({
      answerId: params.answer.id,
      questionId: params.answer.questionId,
      assessmentId: params.submission.assessmentId,
    });
  }
}

function isAnswerCorrected(answer: ReviewAnswerLike): boolean {
  return (
    String(answer.correctionStatus).trim().toUpperCase() ===
      GradeAnswerCorrectionStatus.CORRECTED &&
    toReviewNumber(answer.awardedPoints) !== null
  );
}

function resolveAnswerMaxPoints(answer: ReviewAnswerLike): number {
  return (
    toReviewNumber(answer.maxPoints) ??
    toReviewNumber(answer.question.points) ??
    0
  );
}

function resolveSubmissionMaxScore(submission: ReviewSubmissionLike): number {
  return toReviewNumber(submission.assessment.maxScore) ?? 0;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function toReviewNumber(value: unknown): number | null {
  return toGradeNumber(value as Parameters<typeof toGradeNumber>[0]);
}
