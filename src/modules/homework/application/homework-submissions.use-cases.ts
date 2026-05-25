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
  HomeworkSubmissionNotSubmittableException,
  HomeworkSubmissionTargetNotFoundException,
} from '../domain/homework.exceptions';
import {
  HomeworkRepository,
  HomeworkSubmissionRecord,
  HomeworkTargetForSubmissionRecord,
} from '../infrastructure/homework.repository';

export const HOMEWORK_SUBMISSION_BODY_TEXT_MAX_LENGTH = 20_000;

export interface StudentHomeworkSubmissionCommand {
  homeworkId: string;
  studentId: string;
  enrollmentId: string;
}

export interface SaveStudentHomeworkSubmissionDraftCommand
  extends StudentHomeworkSubmissionCommand {
  bodyText: string;
}

export interface SubmitStudentHomeworkSubmissionCommand
  extends StudentHomeworkSubmissionCommand {
  bodyText?: string | null;
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

    const bodyText = normalizeRequiredBodyText(
      command.bodyText ?? target.submissions[0]?.bodyText ?? null,
    );
    const submittedAt = new Date();
    const isLate =
      target.homeworkAssignment.dueAt.getTime() < submittedAt.getTime();
    const submissionStatus = isLate
      ? HomeworkSubmissionStatus.LATE
      : HomeworkSubmissionStatus.SUBMITTED;
    const targetStatus = isLate
      ? HomeworkTargetStatus.LATE
      : HomeworkTargetStatus.SUBMITTED;

    const result = await this.homeworkRepository.submitSubmission({
      schoolId: target.schoolId,
      homeworkAssignmentId: target.homeworkAssignmentId,
      homeworkTargetId: target.id,
      studentId: target.studentId,
      enrollmentId: target.enrollmentId,
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

function normalizeRequiredBodyText(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    throw new ValidationDomainException('Homework submission body is required', {
      bodyText: 'required',
    });
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new ValidationDomainException('Homework submission body is required', {
      bodyText: 'required',
    });
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
    },
  };
}
