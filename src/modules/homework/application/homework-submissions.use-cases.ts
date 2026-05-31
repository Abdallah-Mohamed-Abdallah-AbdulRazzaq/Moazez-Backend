import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  HomeworkAssignmentStatus,
  HomeworkSubmissionStatus,
  HomeworkTargetStatus,
} from '@prisma/client';
import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import { HomeworkScope, requireHomeworkScope } from '../homework-context';
import {
  HomeworkSubmissionAlreadySubmittedException,
  HomeworkSubmissionAlreadyReviewedException,
  HomeworkSubmissionNotFoundException,
  HomeworkSubmissionNotReviewableException,
  HomeworkSubmissionNotSubmittableException,
  HomeworkSubmissionReviewInvalidException,
  HomeworkSubmissionTargetNotFoundException,
} from '../domain/homework.exceptions';
import {
  HomeworkRepository,
  HomeworkReviewSubmissionRecord,
  HomeworkSubmissionRecord,
  HomeworkTargetForSubmissionRecord,
  ListHomeworkReviewSubmissionsResult,
} from '../infrastructure/homework.repository';
import { HomeworkAnswerInput } from '../domain/homework-answer-inputs';
import {
  saveStudentAnswersAsDraft,
  saveStudentAnswersForSubmit,
  validateRequiredHomeworkAnswers,
} from './homework-answers.use-cases';
import {
  assertAnswerReviewRollupWithinAssignmentMarks,
  assertRequiredAnswerReviewsComplete,
  computeAnswerReviewRollup,
} from './homework-answer-review.use-cases';

export const HOMEWORK_SUBMISSION_BODY_TEXT_MAX_LENGTH = 20_000;
export const HOMEWORK_SUBMISSION_REVIEW_NOTE_MAX_LENGTH = 2_000;

export interface StudentHomeworkSubmissionCommand {
  homeworkId: string;
  studentId: string;
  enrollmentId: string;
}

export interface SaveStudentHomeworkSubmissionDraftCommand extends StudentHomeworkSubmissionCommand {
  bodyText: string;
  answers?: HomeworkAnswerInput[];
}

export interface SubmitStudentHomeworkSubmissionCommand extends StudentHomeworkSubmissionCommand {
  bodyText?: string | null;
  answers?: HomeworkAnswerInput[];
}

export interface ListHomeworkSubmissionsForReviewCommand {
  homeworkId: string;
  statuses?: HomeworkSubmissionStatus[];
  search?: string;
  page?: number;
  limit?: number;
}

export interface HomeworkSubmissionForReviewCommand {
  homeworkId: string;
  submissionId: string;
}

export interface ReviewHomeworkSubmissionCommand extends HomeworkSubmissionForReviewCommand {
  reviewedByUserId: string;
  reviewNote?: string | null;
  awardedMarks?: number | null;
}

@Injectable()
export class GetHomeworkSubmissionUseCase {
  constructor(private readonly homeworkRepository: HomeworkRepository) {}

  async execute(
    command: StudentHomeworkSubmissionCommand,
  ): Promise<HomeworkSubmissionRecord | null> {
    requireHomeworkScope();
    const target = await findStudentSubmissionTargetOrThrow(
      this.homeworkRepository,
      command,
    );

    return target.submissions[0] ?? null;
  }
}

@Injectable()
export class SaveHomeworkSubmissionDraftUseCase {
  constructor(private readonly homeworkRepository: HomeworkRepository) {}

  async execute(
    command: SaveStudentHomeworkSubmissionDraftCommand,
  ): Promise<HomeworkSubmissionRecord> {
    requireHomeworkScope();
    const target = await findStudentSubmissionTargetOrThrow(
      this.homeworkRepository,
      command,
    );
    assertSubmissionIsEditable(target);

    const bodyText = normalizeRequiredBodyText(command.bodyText);
    const result = await this.homeworkRepository.saveDraftSubmission({
      schoolId: target.schoolId,
      homeworkAssignmentId: target.homeworkAssignmentId,
      homeworkTargetId: target.id,
      studentId: target.studentId,
      enrollmentId: target.enrollmentId,
      bodyText,
    });

    if (result.outcome === 'already_submitted') {
      throw new HomeworkSubmissionAlreadySubmittedException({
        homeworkId: command.homeworkId,
        submissionId: result.submission.id,
      });
    }

    if (command.answers && command.answers.length > 0) {
      const submissionWithAnswers = await saveStudentAnswersAsDraft({
        repository: this.homeworkRepository,
        target,
        answers: command.answers,
      });
      return submissionWithAnswers ?? result.submission;
    }

    return result.submission;
  }
}

@Injectable()
export class SubmitHomeworkSubmissionUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: SubmitStudentHomeworkSubmissionCommand,
  ): Promise<HomeworkSubmissionRecord> {
    const scope = requireHomeworkScope();
    const target = await findStudentSubmissionTargetOrThrow(
      this.homeworkRepository,
      command,
    );
    assertSubmissionIsEditable(target);

    const answerSubmission = await saveStudentAnswersForSubmit({
      repository: this.homeworkRepository,
      target,
      answers: command.answers,
    });
    const refreshedTarget =
      answerSubmission && command.answers && command.answers.length > 0
        ? await findStudentSubmissionTargetOrThrow(
            this.homeworkRepository,
            command,
          )
        : target;
    const currentSubmission =
      refreshedTarget.submissions[0] ?? answerSubmission ?? null;
    const questions = refreshedTarget.homeworkAssignment.questions;
    const bodyText =
      questions.length === 0
        ? normalizeRequiredBodyText(
            command.bodyText ?? currentSubmission?.bodyText ?? null,
          )
        : normalizeOptionalBodyText(
            command.bodyText ?? currentSubmission?.bodyText ?? null,
          );

    validateRequiredHomeworkAnswers({
      questions,
      answers: currentSubmission?.answers ?? [],
    });

    const submittedAt = new Date();
    const isLate =
      refreshedTarget.homeworkAssignment.dueAt.getTime() <
      submittedAt.getTime();
    const submissionStatus = isLate
      ? HomeworkSubmissionStatus.LATE
      : HomeworkSubmissionStatus.SUBMITTED;
    const targetStatus = isLate
      ? HomeworkTargetStatus.LATE
      : HomeworkTargetStatus.SUBMITTED;

    const result = await this.homeworkRepository.submitSubmission({
      schoolId: refreshedTarget.schoolId,
      homeworkAssignmentId: refreshedTarget.homeworkAssignmentId,
      homeworkTargetId: refreshedTarget.id,
      studentId: refreshedTarget.studentId,
      enrollmentId: refreshedTarget.enrollmentId,
      bodyText,
      submissionStatus,
      targetStatus,
      submittedAt,
    });

    if (result.outcome === 'already_submitted') {
      throw new HomeworkSubmissionAlreadySubmittedException({
        homeworkId: command.homeworkId,
        submissionId: result.submission.id,
      });
    }

    await this.authRepository.createAuditLog(
      buildSubmissionAuditEntry({
        scope,
        action: 'homework.submission.submit',
        submission: result.submission,
      }),
    );

    return result.submission;
  }
}

@Injectable()
export class ListHomeworkSubmissionsForReviewUseCase {
  constructor(private readonly homeworkRepository: HomeworkRepository) {}

  execute(
    command: ListHomeworkSubmissionsForReviewCommand,
  ): Promise<ListHomeworkReviewSubmissionsResult> {
    requireHomeworkScope();

    return this.homeworkRepository.listReviewableSubmissions({
      homeworkAssignmentId: command.homeworkId,
      statuses: command.statuses,
      search: command.search,
      page: normalizePositiveInteger(command.page, 1),
      limit: normalizeBoundedLimit(command.limit),
    });
  }
}

@Injectable()
export class GetHomeworkSubmissionForReviewUseCase {
  constructor(private readonly homeworkRepository: HomeworkRepository) {}

  async execute(
    command: HomeworkSubmissionForReviewCommand,
  ): Promise<HomeworkReviewSubmissionRecord> {
    requireHomeworkScope();

    const submission = await this.homeworkRepository.findReviewableSubmission({
      homeworkAssignmentId: command.homeworkId,
      submissionId: command.submissionId,
    });

    if (!submission) {
      throw new HomeworkSubmissionNotFoundException({
        homeworkId: command.homeworkId,
        submissionId: command.submissionId,
      });
    }

    return submission;
  }
}

@Injectable()
export class ReviewHomeworkSubmissionUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: ReviewHomeworkSubmissionCommand,
  ): Promise<HomeworkReviewSubmissionRecord> {
    const scope = requireHomeworkScope();
    const submission = await this.homeworkRepository.findReviewableSubmission({
      homeworkAssignmentId: command.homeworkId,
      submissionId: command.submissionId,
    });

    if (!submission) {
      throw new HomeworkSubmissionNotFoundException({
        homeworkId: command.homeworkId,
        submissionId: command.submissionId,
      });
    }

    assertSubmissionIsReviewable(submission);
    const reviewNote = normalizeReviewNote(command.reviewNote);
    const awardedMarks = resolveSubmissionReviewAwardedMarks({
      value: command.awardedMarks,
      submission,
    });
    const reviewedAt = new Date();

    const result = await this.homeworkRepository.reviewSubmission({
      schoolId: submission.schoolId,
      homeworkAssignmentId: submission.homeworkAssignmentId,
      submissionId: submission.id,
      homeworkTargetId: submission.homeworkTargetId,
      studentId: submission.studentId,
      enrollmentId: submission.enrollmentId,
      reviewedByUserId: command.reviewedByUserId,
      reviewedAt,
      reviewNote,
      awardedMarks,
    });

    if (result.outcome === 'not_found') {
      throw new HomeworkSubmissionNotFoundException({
        homeworkId: command.homeworkId,
        submissionId: command.submissionId,
      });
    }

    if (result.outcome === 'already_reviewed') {
      throw new HomeworkSubmissionAlreadyReviewedException({
        homeworkId: command.homeworkId,
        submissionId: command.submissionId,
      });
    }

    if (result.outcome === 'not_reviewable') {
      throw new HomeworkSubmissionNotReviewableException({
        homeworkId: command.homeworkId,
        submissionId: command.submissionId,
        status: result.submission.status,
      });
    }

    await this.authRepository.createAuditLog(
      buildSubmissionAuditEntry({
        scope,
        action: 'homework.submission.review',
        submission: result.submission,
      }),
    );

    return result.submission;
  }
}

async function findStudentSubmissionTargetOrThrow(
  repository: HomeworkRepository,
  command: StudentHomeworkSubmissionCommand,
): Promise<HomeworkTargetForSubmissionRecord> {
  const target = await repository.findStudentTargetForSubmission(command);
  if (!target) {
    throw new HomeworkSubmissionTargetNotFoundException({
      homeworkId: command.homeworkId,
    });
  }

  return target;
}

function assertSubmissionIsEditable(
  target: HomeworkTargetForSubmissionRecord,
): void {
  if (target.homeworkAssignment.status !== HomeworkAssignmentStatus.PUBLISHED) {
    throw new HomeworkSubmissionNotSubmittableException({
      homeworkId: target.homeworkAssignmentId,
      assignmentStatus: target.homeworkAssignment.status,
    });
  }

  if (
    target.status === HomeworkTargetStatus.SUBMITTED ||
    target.status === HomeworkTargetStatus.LATE ||
    target.status === HomeworkTargetStatus.REVIEWED
  ) {
    throw new HomeworkSubmissionAlreadySubmittedException({
      homeworkId: target.homeworkAssignmentId,
      targetId: target.id,
      targetStatus: target.status,
    });
  }

  if (
    target.status === HomeworkTargetStatus.MISSING ||
    target.status === HomeworkTargetStatus.EXCUSED
  ) {
    throw new HomeworkSubmissionNotSubmittableException({
      homeworkId: target.homeworkAssignmentId,
      targetId: target.id,
      targetStatus: target.status,
    });
  }

  if (
    target.submissions[0]?.status &&
    target.submissions[0].status !== HomeworkSubmissionStatus.DRAFT
  ) {
    throw new HomeworkSubmissionAlreadySubmittedException({
      homeworkId: target.homeworkAssignmentId,
      submissionId: target.submissions[0].id,
      submissionStatus: target.submissions[0].status,
    });
  }
}

function assertSubmissionIsReviewable(
  submission: HomeworkReviewSubmissionRecord,
): void {
  if (submission.homeworkAssignment.deletedAt) {
    throw new HomeworkSubmissionNotFoundException({
      homeworkId: submission.homeworkAssignmentId,
      submissionId: submission.id,
    });
  }

  if (
    submission.homeworkAssignment.status === HomeworkAssignmentStatus.CANCELLED
  ) {
    throw new HomeworkSubmissionNotReviewableException({
      homeworkId: submission.homeworkAssignmentId,
      submissionId: submission.id,
      assignmentStatus: submission.homeworkAssignment.status,
    });
  }

  if (
    submission.homeworkAssignment.status === HomeworkAssignmentStatus.ARCHIVED
  ) {
    throw new HomeworkSubmissionNotReviewableException({
      homeworkId: submission.homeworkAssignmentId,
      submissionId: submission.id,
      assignmentStatus: submission.homeworkAssignment.status,
    });
  }

  if (submission.status === HomeworkSubmissionStatus.REVIEWED) {
    throw new HomeworkSubmissionAlreadyReviewedException({
      homeworkId: submission.homeworkAssignmentId,
      submissionId: submission.id,
    });
  }

  if (
    submission.status !== HomeworkSubmissionStatus.SUBMITTED &&
    submission.status !== HomeworkSubmissionStatus.LATE
  ) {
    throw new HomeworkSubmissionNotReviewableException({
      homeworkId: submission.homeworkAssignmentId,
      submissionId: submission.id,
      status: submission.status,
    });
  }
}

function normalizeRequiredBodyText(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    throw new ValidationDomainException(
      'Homework submission body is required',
      {
        bodyText: 'required',
      },
    );
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new ValidationDomainException(
      'Homework submission body is required',
      {
        bodyText: 'required',
      },
    );
  }

  if (normalized.length > HOMEWORK_SUBMISSION_BODY_TEXT_MAX_LENGTH) {
    throw new ValidationDomainException(
      'Homework submission body is too long',
      {
        bodyText: 'max_length',
        maxLength: HOMEWORK_SUBMISSION_BODY_TEXT_MAX_LENGTH,
      },
    );
  }

  return normalized;
}

function normalizeOptionalBodyText(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;

  const normalized = value.trim();
  if (!normalized) return null;

  if (normalized.length > HOMEWORK_SUBMISSION_BODY_TEXT_MAX_LENGTH) {
    throw new ValidationDomainException(
      'Homework submission body is too long',
      {
        bodyText: 'max_length',
        maxLength: HOMEWORK_SUBMISSION_BODY_TEXT_MAX_LENGTH,
      },
    );
  }

  return normalized;
}

function normalizeReviewNote(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();

  if (!normalized) {
    throw new ValidationDomainException('Homework review note is empty', {
      reviewNote: 'not_empty',
    });
  }

  if (normalized.length > HOMEWORK_SUBMISSION_REVIEW_NOTE_MAX_LENGTH) {
    throw new ValidationDomainException('Homework review note is too long', {
      reviewNote: 'max_length',
      maxLength: HOMEWORK_SUBMISSION_REVIEW_NOTE_MAX_LENGTH,
    });
  }

  return normalized;
}

function resolveSubmissionReviewAwardedMarks(input: {
  value: number | null | undefined;
  submission: HomeworkReviewSubmissionRecord;
}): number | null {
  const questions = input.submission.homeworkAssignment.questions ?? [];
  if (questions.length === 0) {
    return normalizeAwardedMarks(input);
  }

  assertRequiredAnswerReviewsComplete(input.submission);
  const awardedMarks = computeAnswerReviewRollup(input.submission);
  assertAnswerReviewRollupWithinAssignmentMarks({
    submission: input.submission,
    awardedMarks,
  });

  return awardedMarks;
}

function normalizeAwardedMarks(input: {
  value: number | null | undefined;
  submission: HomeworkReviewSubmissionRecord;
}): number | null {
  if (input.value === null || input.value === undefined) return null;

  if (!Number.isFinite(input.value) || input.value < 0) {
    throw new HomeworkSubmissionReviewInvalidException({
      awardedMarks: 'min',
      min: 0,
    });
  }

  if (!input.submission.homeworkAssignment.isGraded) {
    throw new HomeworkSubmissionReviewInvalidException({
      awardedMarks: 'not_allowed_for_ungraded_homework',
      isGraded: false,
    });
  }

  const totalMarks = toNumber(input.submission.homeworkAssignment.totalMarks);
  if (totalMarks !== null && input.value > totalMarks) {
    throw new HomeworkSubmissionReviewInvalidException({
      awardedMarks: 'max',
      max: totalMarks,
    });
  }

  return input.value;
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
): number {
  if (!value || Number.isNaN(value)) return fallback;
  return Math.max(Math.trunc(value), 1);
}

function normalizeBoundedLimit(value: number | undefined): number {
  return Math.min(normalizePositiveInteger(value, 25), 100);
}

function toNumber(
  value: { toNumber(): number } | number | string | null,
): number | null {
  if (value === null) return null;
  if (typeof value === 'object') return value.toNumber();

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildSubmissionAuditEntry(input: {
  scope: HomeworkScope;
  action: string;
  submission: HomeworkSubmissionRecord;
}) {
  return {
    actorId: input.scope.actorId,
    userType: input.scope.userType,
    organizationId: input.scope.organizationId,
    schoolId: input.scope.schoolId,
    module: 'homework',
    action: input.action,
    resourceType: 'homework_submission',
    resourceId: input.submission.id,
    outcome: AuditOutcome.SUCCESS,
    after: {
      id: input.submission.id,
      homeworkAssignmentId: input.submission.homeworkAssignmentId,
      homeworkTargetId: input.submission.homeworkTargetId,
      studentId: input.submission.studentId,
      enrollmentId: input.submission.enrollmentId,
      status: input.submission.status,
      submittedAt: input.submission.submittedAt?.toISOString() ?? null,
      reviewedAt: input.submission.reviewedAt?.toISOString() ?? null,
      reviewedByUserId: input.submission.reviewedByUserId ?? null,
      reviewNotePresent: Boolean(input.submission.reviewNote),
      awardedMarks:
        input.submission.awardedMarks === null
          ? null
          : toNumber(input.submission.awardedMarks),
    },
  };
}
