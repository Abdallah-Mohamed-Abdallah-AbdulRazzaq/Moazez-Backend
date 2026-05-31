import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  HomeworkAssignmentStatus,
  HomeworkSubmissionStatus,
} from '@prisma/client';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import { HomeworkScope, requireHomeworkScope } from '../homework-context';
import {
  BulkHomeworkAnswerReviewInput,
  HomeworkAnswerReviewInput,
  NormalizedHomeworkAnswerReviewInput,
} from '../domain/homework-answer-review-inputs';
import {
  HomeworkAnswerReviewExceedsAssignmentMarksException,
  HomeworkAnswerReviewExceedsQuestionPointsException,
  HomeworkAnswerReviewIncompleteRequiredAnswersException,
  HomeworkAnswerReviewInvalidPointsException,
  HomeworkAnswerReviewInvalidScopeException,
  HomeworkAnswerReviewNotFoundException,
  HomeworkAnswerReviewNotSubmittedException,
  HomeworkAnswerReviewReadOnlyException,
} from '../domain/homework-answer-review.exceptions';
import {
  HomeworkRepository,
  HomeworkReviewSubmissionRecord,
} from '../infrastructure/homework.repository';
import {
  HomeworkAnswerDetailResponseDto,
  HomeworkAnswersListResponseDto,
} from '../dto/homework-answer-response.dto';
import {
  presentHomeworkAnswerDetailTeacher,
  presentHomeworkAnswersTeacher,
} from '../presenters/homework-answer.presenter';

export interface ReviewHomeworkSubmissionAnswerCommand {
  homeworkId: string;
  submissionId: string;
  answerId: string;
  reviewedByUserId?: string;
  review: HomeworkAnswerReviewInput;
}

export interface BulkReviewHomeworkSubmissionAnswersCommand {
  homeworkId: string;
  submissionId: string;
  reviewedByUserId?: string;
  reviews: BulkHomeworkAnswerReviewInput[];
}

@Injectable()
export class ReviewHomeworkSubmissionAnswerUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: ReviewHomeworkSubmissionAnswerCommand,
  ): Promise<HomeworkAnswerDetailResponseDto> {
    const scope = requireHomeworkScope();
    const reviewedByUserId = command.reviewedByUserId ?? scope.actorId;
    const result = await reviewAnswers({
      homeworkRepository: this.homeworkRepository,
      homeworkId: command.homeworkId,
      submissionId: command.submissionId,
      reviewedByUserId,
      reviews: [{ answerId: command.answerId, ...command.review }],
      singleAnswer: true,
    });
    const answer = result.submission.answers.find(
      (item) => item.id === command.answerId,
    );

    if (!answer) {
      throw new HomeworkAnswerReviewNotFoundException({
        homeworkId: command.homeworkId,
        submissionId: command.submissionId,
        answerId: command.answerId,
      });
    }

    await this.authRepository.createAuditLog(
      buildAnswerReviewAuditEntry({
        scope,
        action: 'homework.answer_review.review',
        submission: result.submission,
        answerIds: [command.answerId],
      }),
    );

    return presentHomeworkAnswerDetailTeacher(answer);
  }
}

@Injectable()
export class BulkReviewHomeworkSubmissionAnswersUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: BulkReviewHomeworkSubmissionAnswersCommand,
  ): Promise<HomeworkAnswersListResponseDto> {
    const scope = requireHomeworkScope();
    const reviewedByUserId = command.reviewedByUserId ?? scope.actorId;
    const result = await reviewAnswers({
      homeworkRepository: this.homeworkRepository,
      homeworkId: command.homeworkId,
      submissionId: command.submissionId,
      reviewedByUserId,
      reviews: command.reviews,
      singleAnswer: false,
    });
    const reviewedAnswerIds = new Set(
      command.reviews.map((review) => review.answerId),
    );
    const reviewedAnswers = result.submission.answers.filter((answer) =>
      reviewedAnswerIds.has(answer.id),
    );

    await this.authRepository.createAuditLog(
      buildAnswerReviewAuditEntry({
        scope,
        action: 'homework.answer_review.bulk_review',
        submission: result.submission,
        answerIds: [...reviewedAnswerIds],
      }),
    );

    return presentHomeworkAnswersTeacher(reviewedAnswers);
  }
}

export function assertRequiredAnswerReviewsComplete(
  submission: HomeworkReviewSubmissionRecord,
): void {
  const answerByQuestionId = new Map(
    submission.answers.map((answer) => [answer.homeworkQuestionId, answer]),
  );

  for (const question of submission.homeworkAssignment.questions) {
    if (!question.isRequired) continue;
    const answer = answerByQuestionId.get(question.id);
    if (!answer?.reviewedAt) {
      throw new HomeworkAnswerReviewIncompleteRequiredAnswersException({
        homeworkId: submission.homeworkAssignmentId,
        submissionId: submission.id,
        questionId: question.id,
      });
    }
  }
}

export function computeAnswerReviewRollup(
  submission: HomeworkReviewSubmissionRecord,
): number {
  return roundToTwo(
    submission.answers.reduce(
      (total, answer) => total + (toNumber(answer.awardedPoints) ?? 0),
      0,
    ),
  );
}

export function assertAnswerReviewRollupWithinAssignmentMarks(input: {
  submission: HomeworkReviewSubmissionRecord;
  awardedMarks: number;
}): void {
  const totalMarks = toNumber(input.submission.homeworkAssignment.totalMarks);
  if (totalMarks !== null && input.awardedMarks > totalMarks) {
    throw new HomeworkAnswerReviewExceedsAssignmentMarksException({
      homeworkId: input.submission.homeworkAssignmentId,
      submissionId: input.submission.id,
      awardedMarks: input.awardedMarks,
      totalMarks,
    });
  }
}

async function reviewAnswers(input: {
  homeworkRepository: HomeworkRepository;
  homeworkId: string;
  submissionId: string;
  reviewedByUserId: string;
  reviews: BulkHomeworkAnswerReviewInput[];
  singleAnswer: boolean;
}): Promise<{ submission: HomeworkReviewSubmissionRecord }> {
  const submission =
    await input.homeworkRepository.findSubmissionForAnswerReview({
      homeworkAssignmentId: input.homeworkId,
      submissionId: input.submissionId,
    });

  if (!submission) {
    throw new HomeworkAnswerReviewNotFoundException({
      homeworkId: input.homeworkId,
      submissionId: input.submissionId,
    });
  }

  assertSubmissionAcceptsAnswerReview(submission);
  const normalizedReviews = normalizeAnswerReviews({
    submission,
    reviews: input.reviews,
    reviewedByUserId: input.reviewedByUserId,
    singleAnswer: input.singleAnswer,
  });
  const awardedMarks = computeRollupFromNormalizedReviews({
    submission,
    reviews: normalizedReviews,
  });
  assertAnswerReviewRollupWithinAssignmentMarks({
    submission,
    awardedMarks,
  });

  const result = await input.homeworkRepository.reviewSubmissionAnswers({
    schoolId: submission.schoolId,
    homeworkAssignmentId: submission.homeworkAssignmentId,
    submissionId: submission.id,
    homeworkTargetId: submission.homeworkTargetId,
    studentId: submission.studentId,
    enrollmentId: submission.enrollmentId,
    awardedMarks,
    reviews: normalizedReviews.map((review) => ({
      ...review,
      homeworkQuestionId:
        submission.answers.find((answer) => answer.id === review.answerId)
          ?.homeworkQuestionId ?? '',
      reviewedAt: new Date(),
      reviewedByUserId: input.reviewedByUserId,
    })),
  });

  if (result.outcome === 'not_found') {
    throw new HomeworkAnswerReviewInvalidScopeException({
      homeworkId: input.homeworkId,
      submissionId: input.submissionId,
    });
  }

  return { submission: result.submission };
}

function assertSubmissionAcceptsAnswerReview(
  submission: HomeworkReviewSubmissionRecord,
): void {
  if (
    submission.homeworkAssignment.status !==
      HomeworkAssignmentStatus.PUBLISHED &&
    submission.homeworkAssignment.status !== HomeworkAssignmentStatus.CLOSED
  ) {
    throw new HomeworkAnswerReviewReadOnlyException({
      homeworkId: submission.homeworkAssignmentId,
      submissionId: submission.id,
      assignmentStatus: submission.homeworkAssignment.status,
    });
  }

  if (submission.status === HomeworkSubmissionStatus.DRAFT) {
    throw new HomeworkAnswerReviewNotSubmittedException({
      homeworkId: submission.homeworkAssignmentId,
      submissionId: submission.id,
      status: submission.status,
    });
  }

  if (submission.status === HomeworkSubmissionStatus.REVIEWED) {
    throw new HomeworkAnswerReviewReadOnlyException({
      homeworkId: submission.homeworkAssignmentId,
      submissionId: submission.id,
      status: submission.status,
    });
  }
}

function normalizeAnswerReviews(input: {
  submission: HomeworkReviewSubmissionRecord;
  reviews: BulkHomeworkAnswerReviewInput[];
  reviewedByUserId: string;
  singleAnswer: boolean;
}): NormalizedHomeworkAnswerReviewInput[] {
  const seenAnswerIds = new Set<string>();
  const answerById = new Map(
    input.submission.answers.map((answer) => [answer.id, answer]),
  );

  return input.reviews.map((review) => {
    if (seenAnswerIds.has(review.answerId)) {
      throw new HomeworkAnswerReviewInvalidScopeException({
        homeworkId: input.submission.homeworkAssignmentId,
        submissionId: input.submission.id,
        answerId: review.answerId,
        reason: 'duplicate_answer',
      });
    }
    seenAnswerIds.add(review.answerId);

    const answer = answerById.get(review.answerId);
    if (!answer) {
      const details = {
        homeworkId: input.submission.homeworkAssignmentId,
        submissionId: input.submission.id,
        answerId: review.answerId,
      };
      if (input.singleAnswer) {
        throw new HomeworkAnswerReviewNotFoundException(details);
      }
      throw new HomeworkAnswerReviewInvalidScopeException(details);
    }

    return {
      answerId: answer.id,
      awardedPoints: normalizeAwardedPoints({
        value: review.awardedPoints,
        hasAwardedPoints: hasOwn(review, 'awardedPoints'),
        currentValue: answer.awardedPoints,
        questionPoints: answer.homeworkQuestion.points,
        answerId: answer.id,
        questionId: answer.homeworkQuestionId,
      }),
      teacherComment: normalizeTeacherComment({
        value: review.teacherComment,
        hasTeacherComment: hasOwn(review, 'teacherComment'),
        currentValue: answer.teacherComment,
      }),
    };
  });
}

function normalizeAwardedPoints(input: {
  value: number | null | undefined;
  hasAwardedPoints: boolean;
  currentValue: { toNumber(): number } | number | string | null;
  questionPoints: { toNumber(): number } | number | string;
  answerId: string;
  questionId: string;
}): number | null {
  const currentValue = toNumber(input.currentValue);
  if (!input.hasAwardedPoints) {
    return currentValue;
  }

  if (input.value === null || input.value === undefined) {
    return null;
  }

  if (!Number.isFinite(input.value) || input.value < 0) {
    throw new HomeworkAnswerReviewInvalidPointsException({
      answerId: input.answerId,
      questionId: input.questionId,
      awardedPoints: input.value,
    });
  }

  const awardedPoints = roundToTwo(input.value);
  const questionPoints = toNumber(input.questionPoints) ?? 0;
  if (awardedPoints > questionPoints) {
    throw new HomeworkAnswerReviewExceedsQuestionPointsException({
      answerId: input.answerId,
      questionId: input.questionId,
      awardedPoints,
      questionPoints,
    });
  }

  return awardedPoints;
}

function normalizeTeacherComment(input: {
  value: string | null | undefined;
  hasTeacherComment: boolean;
  currentValue: string | null;
}): string | null {
  if (!input.hasTeacherComment) {
    return input.currentValue ?? null;
  }

  if (input.value === null || input.value === undefined) return null;
  const normalized = input.value.trim();
  return normalized.length > 0 ? normalized : null;
}

function computeRollupFromNormalizedReviews(input: {
  submission: HomeworkReviewSubmissionRecord;
  reviews: NormalizedHomeworkAnswerReviewInput[];
}): number {
  const awardedByAnswerId = new Map(
    input.reviews.map((review) => [review.answerId, review.awardedPoints]),
  );

  return roundToTwo(
    input.submission.answers.reduce((total, answer) => {
      const awardedPoints = awardedByAnswerId.has(answer.id)
        ? awardedByAnswerId.get(answer.id)
        : toNumber(answer.awardedPoints);

      return total + (awardedPoints ?? 0);
    }, 0),
  );
}

function buildAnswerReviewAuditEntry(input: {
  scope: HomeworkScope;
  action: string;
  submission: HomeworkReviewSubmissionRecord;
  answerIds: string[];
}) {
  return {
    actorId: input.scope.actorId,
    userType: input.scope.userType,
    organizationId: input.scope.organizationId,
    schoolId: input.scope.schoolId,
    module: 'homework',
    action: input.action,
    resourceType:
      input.answerIds.length === 1
        ? 'homework_submission_answer'
        : 'homework_submission',
    resourceId:
      input.answerIds.length === 1 ? input.answerIds[0] : input.submission.id,
    outcome: AuditOutcome.SUCCESS,
    after: {
      homeworkAssignmentId: input.submission.homeworkAssignmentId,
      homeworkSubmissionId: input.submission.id,
      homeworkTargetId: input.submission.homeworkTargetId,
      answerIds: input.answerIds,
      awardedMarks: toNumber(input.submission.awardedMarks),
    },
  };
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function toNumber(
  value: { toNumber(): number } | number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value.toNumber();

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}
