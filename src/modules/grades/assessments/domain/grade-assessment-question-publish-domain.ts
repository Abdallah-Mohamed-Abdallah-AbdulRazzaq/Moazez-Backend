import { HttpStatus } from '@nestjs/common';
import {
  GradeAssessmentApprovalStatus,
  GradeAssessmentDeliveryMode,
  GradeQuestionType,
} from '@prisma/client';
import {
  DomainException,
  ValidationDomainException,
} from '../../../../common/exceptions/domain-exception';
import { toGradeNumber } from '../../shared/domain/grade-calculation';
import {
  isAssessmentLocked,
  normalizeAssessmentApprovalStatus,
  normalizeDeliveryMode,
} from '../../shared/domain/grade-workflow';
import {
  GradeAssessmentAlreadyApprovedException,
  GradeAssessmentAlreadyPublishedException,
  GradeAssessmentInvalidStatusTransitionException,
  GradeAssessmentLockedException,
  validateAssessmentMaxScore,
} from './grade-assessment-domain';
import {
  GradeAnswerInvalidOptionException,
  normalizeQuestionType,
} from './grade-question-domain';

export interface QuestionPublishAssessmentLike {
  id: string;
  deliveryMode: GradeAssessmentDeliveryMode | string;
  approvalStatus: GradeAssessmentApprovalStatus | string;
  maxScore: unknown;
  lockedAt?: Date | string | null;
  isLocked?: boolean | null;
}

export interface QuestionPublishOptionLike {
  id?: string;
  isCorrect: boolean;
  deletedAt?: Date | string | null;
}

export interface QuestionPublishQuestionLike {
  id: string;
  type: GradeQuestionType | string;
  points: unknown;
  answerKey?: unknown;
  metadata?: unknown;
  deletedAt?: Date | string | null;
  options: QuestionPublishOptionLike[];
}

export interface QuestionPublishSummary {
  totalQuestions: number;
  totalPoints: number;
  maxScore: number;
  pointsMatchMaxScore: boolean;
}

export class GradeQuestionPointsMismatchException extends DomainException {
  constructor(details?: Record<string, unknown>) {
    super({
      code: 'grades.question.points_mismatch',
      message: 'Total question points do not match assessment total',
      httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    });
  }
}

export function assertQuestionBasedAssessmentPublishable(
  assessment: QuestionPublishAssessmentLike,
): void {
  if (
    normalizeDeliveryMode(assessment.deliveryMode) !==
    GradeAssessmentDeliveryMode.QUESTION_BASED
  ) {
    throw new ValidationDomainException(
      'Assessment must be question-based for question publish validation',
      {
        assessmentId: assessment.id,
        deliveryMode: assessment.deliveryMode,
      },
    );
  }

  validateAssessmentMaxScore(assessment.maxScore);

  if (isAssessmentLocked(assessment)) {
    throw new GradeAssessmentLockedException({ assessmentId: assessment.id });
  }

  const approvalStatus = normalizeAssessmentApprovalStatus(
    assessment.approvalStatus,
  );
  if (approvalStatus === GradeAssessmentApprovalStatus.DRAFT) return;
  if (approvalStatus === GradeAssessmentApprovalStatus.PUBLISHED) {
    throw new GradeAssessmentAlreadyPublishedException({
      assessmentId: assessment.id,
      approvalStatus,
    });
  }
  if (approvalStatus === GradeAssessmentApprovalStatus.APPROVED) {
    throw new GradeAssessmentAlreadyApprovedException({
      assessmentId: assessment.id,
      approvalStatus,
    });
  }

  throw new GradeAssessmentInvalidStatusTransitionException({
    assessmentId: assessment.id,
    approvalStatus,
  });
}

export function assertQuestionBasedPublishReady(params: {
  assessment: QuestionPublishAssessmentLike;
  questions: QuestionPublishQuestionLike[];
}): QuestionPublishSummary {
  const activeQuestions = activeQuestionList(params.questions);
  assertAtLeastOneQuestion(activeQuestions, params.assessment.id);

  for (const question of activeQuestions) {
    validateQuestionForPublish(question);
  }

  return assertQuestionPointsMatchAssessmentMaxScore({
    assessment: params.assessment,
    questions: activeQuestions,
  });
}

export function summarizeQuestionStructureForPublish(params: {
  assessment: Pick<QuestionPublishAssessmentLike, 'maxScore'>;
  questions: QuestionPublishQuestionLike[];
}): QuestionPublishSummary {
  const activeQuestions = activeQuestionList(params.questions);
  const totalPoints = calculateActiveQuestionTotalPoints(activeQuestions);
  const maxScore = toNumber(params.assessment.maxScore);

  return {
    totalQuestions: activeQuestions.length,
    totalPoints,
    maxScore,
    pointsMatchMaxScore: pointsEqual(totalPoints, maxScore),
  };
}

export function calculateActiveQuestionTotalPoints(
  questions: QuestionPublishQuestionLike[],
): number {
  return activeQuestionList(questions).reduce(
    (total, question) => total + requirePositiveQuestionPoints(question),
    0,
  );
}

export function assertAtLeastOneQuestion(
  questions: QuestionPublishQuestionLike[],
  assessmentId?: string,
): void {
  if (activeQuestionList(questions).length > 0) return;

  throw new ValidationDomainException(
    'Question-based assessments require at least one active question before publishing',
    {
      field: 'questions',
      assessmentId,
    },
  );
}

export function assertQuestionPointsMatchAssessmentMaxScore(params: {
  assessment: Pick<QuestionPublishAssessmentLike, 'id' | 'maxScore'>;
  questions: QuestionPublishQuestionLike[];
}): QuestionPublishSummary {
  const summary = summarizeQuestionStructureForPublish({
    assessment: params.assessment,
    questions: params.questions,
  });

  if (!summary.pointsMatchMaxScore) {
    throw new GradeQuestionPointsMismatchException({
      assessmentId: params.assessment.id,
      totalPoints: summary.totalPoints,
      maxScore: summary.maxScore,
    });
  }

  return summary;
}

export function validateQuestionForPublish(
  question: QuestionPublishQuestionLike,
): void {
  requirePositiveQuestionPoints(question);
  assertQuestionOptionsValidForPublish(question);
}

export function assertQuestionOptionsValidForPublish(
  question: QuestionPublishQuestionLike,
): void {
  const type = normalizeQuestionType(question.type);
  const options = activeOptionList(question.options);
  const correctCount = options.filter((option) => option.isCorrect).length;

  switch (type) {
    case GradeQuestionType.MCQ_SINGLE:
      assertMinimumOptions(type, question.id, options.length, 2);
      if (correctCount !== 1) {
        throwInvalidOption(type, question.id, 'exactly_one_correct_required');
      }
      return;

    case GradeQuestionType.MCQ_MULTI:
      assertMinimumOptions(type, question.id, options.length, 2);
      if (correctCount < 1) {
        throwInvalidOption(type, question.id, 'at_least_one_correct_required');
      }
      return;

    case GradeQuestionType.TRUE_FALSE:
      if (options.length !== 2 || correctCount !== 1) {
        throwInvalidOption(
          type,
          question.id,
          'exactly_two_options_and_one_correct_required',
        );
      }
      return;

    case GradeQuestionType.SHORT_ANSWER:
    case GradeQuestionType.ESSAY:
    case GradeQuestionType.FILL_IN_BLANK:
    case GradeQuestionType.MEDIA:
      if (options.length > 0) {
        throwInvalidOption(type, question.id, 'options_not_allowed');
      }
      return;

    case GradeQuestionType.MATCHING:
      if (options.length === 0 && !hasUsableMetadata(question.metadata)) {
        throw new ValidationDomainException(
          'MATCHING questions require options or metadata before publishing',
          {
            field: 'metadata',
            questionId: question.id,
            type,
          },
        );
      }
      return;
  }
}

function activeQuestionList(
  questions: QuestionPublishQuestionLike[],
): QuestionPublishQuestionLike[] {
  return questions.filter((question) => !question.deletedAt);
}

function activeOptionList(
  options: QuestionPublishOptionLike[],
): QuestionPublishOptionLike[] {
  return options.filter((option) => !option.deletedAt);
}

function assertMinimumOptions(
  type: GradeQuestionType,
  questionId: string,
  actual: number,
  minimum: number,
): void {
  if (actual >= minimum) return;
  throwInvalidOption(type, questionId, 'minimum_options_required');
}

function throwInvalidOption(
  type: GradeQuestionType,
  questionId: string,
  reason: string,
): never {
  throw new GradeAnswerInvalidOptionException({
    questionId,
    type,
    reason,
  });
}

function requirePositiveQuestionPoints(
  question: Pick<QuestionPublishQuestionLike, 'id' | 'points'>,
): number {
  const points = toNumber(question.points);
  if (points <= 0) {
    throw new ValidationDomainException(
      'Question points must be greater than 0 before publishing',
      {
        field: 'points',
        questionId: question.id,
        value: question.points,
      },
    );
  }

  return points;
}

function toNumber(value: unknown): number {
  return toGradeNumber(value as Parameters<typeof toGradeNumber>[0]) ?? 0;
}

function pointsEqual(first: number, second: number): boolean {
  return Math.abs(first - second) < 0.005;
}

function hasUsableMetadata(metadata: unknown): boolean {
  if (!metadata) return false;
  if (Array.isArray(metadata)) return metadata.length > 0;
  if (typeof metadata === 'object') return Object.keys(metadata).length > 0;
  return true;
}
