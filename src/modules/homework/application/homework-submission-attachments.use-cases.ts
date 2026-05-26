import { Injectable } from '@nestjs/common';
import {
  AuditOutcome,
  HomeworkAssignmentStatus,
  HomeworkSubmissionStatus,
  HomeworkTargetStatus,
} from '@prisma/client';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import { HomeworkScope, requireHomeworkScope } from '../homework-context';
import {
  CreateHomeworkSubmissionAttachmentDto,
  ReorderHomeworkSubmissionAttachmentDto,
  UpdateHomeworkSubmissionAttachmentDto,
} from '../dto/homework-submission-attachment.dto';
import {
  HomeworkSubmissionAttachmentDetailResponseDto,
  HomeworkSubmissionAttachmentsListResponseDto,
} from '../dto/homework-submission-attachment-response.dto';
import {
  HomeworkSubmissionAttachmentFileNotFoundException,
  HomeworkSubmissionAttachmentInvalidReorderException,
  HomeworkSubmissionAttachmentNotFoundException,
  HomeworkSubmissionAttachmentReadOnlyException,
} from '../domain/homework-submission-attachment.exceptions';
import {
  HomeworkRepository,
  HomeworkSubmissionAttachmentRecord,
  HomeworkSubmissionRecord,
  HomeworkTargetForSubmissionRecord,
  UpdateHomeworkSubmissionAttachmentData,
} from '../infrastructure/homework.repository';
import {
  presentHomeworkSubmissionAttachmentDetail,
  presentHomeworkSubmissionAttachments,
} from '../presenters/homework-submission-attachment.presenter';
import { HomeworkAnswerInvalidSubmissionScopeException } from '../domain/homework-answer.exceptions';

export interface StudentHomeworkSubmissionAttachmentsCommand {
  homeworkId: string;
  studentId: string;
  enrollmentId: string;
}

export interface StudentHomeworkSubmissionAttachmentCommand extends StudentHomeworkSubmissionAttachmentsCommand {
  attachmentId: string;
}

@Injectable()
export class ListHomeworkSubmissionAttachmentsUseCase {
  constructor(private readonly homeworkRepository: HomeworkRepository) {}

  async execute(input: {
    homeworkId: string;
    submissionId: string;
  }): Promise<HomeworkSubmissionAttachmentsListResponseDto> {
    requireHomeworkScope();
    await requireSubmissionInAssignment(this.homeworkRepository, input);
    const attachments = await this.homeworkRepository.listSubmissionAttachments(
      {
        homeworkAssignmentId: input.homeworkId,
        submissionId: input.submissionId,
      },
    );

    return presentHomeworkSubmissionAttachments(attachments);
  }
}

@Injectable()
export class ListStudentHomeworkSubmissionAttachmentsUseCase {
  constructor(private readonly homeworkRepository: HomeworkRepository) {}

  async execute(
    command: StudentHomeworkSubmissionAttachmentsCommand,
  ): Promise<HomeworkSubmissionAttachmentsListResponseDto> {
    requireHomeworkScope();
    const target = await findStudentTargetOrThrow(
      this.homeworkRepository,
      command,
    );
    const submission = target.submissions[0];
    if (!submission) {
      return { items: [] };
    }

    return presentHomeworkSubmissionAttachments(submission.attachments);
  }
}

@Injectable()
export class CreateStudentHomeworkSubmissionAttachmentUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: StudentHomeworkSubmissionAttachmentsCommand,
    dto: CreateHomeworkSubmissionAttachmentDto,
  ): Promise<HomeworkSubmissionAttachmentDetailResponseDto> {
    const scope = requireHomeworkScope();
    const target = await findStudentTargetOrThrow(
      this.homeworkRepository,
      command,
    );
    assertSubmissionAttachmentsEditable(target);
    const submission = await resolveDraftSubmissionOrThrow(
      this.homeworkRepository,
      target,
    );
    const file = await this.homeworkRepository.findAttachmentFile(dto.fileId);
    if (
      !file ||
      file.schoolId !== scope.schoolId ||
      file.deletedAt ||
      file.uploaderId !== scope.actorId
    ) {
      throw new HomeworkSubmissionAttachmentFileNotFoundException({
        fileId: dto.fileId,
      });
    }

    const sortOrder =
      dto.sortOrder ??
      (await this.homeworkRepository.getNextSubmissionAttachmentSortOrder(
        submission.id,
      ));
    const attachment = await this.homeworkRepository.createSubmissionAttachment(
      {
        schoolId: target.schoolId,
        homeworkSubmissionId: submission.id,
        homeworkAssignmentId: target.homeworkAssignmentId,
        homeworkTargetId: target.id,
        fileId: file.id,
        title: normalizeNullableText(dto.title),
        description: normalizeNullableText(dto.description),
        sortOrder,
        createdByUserId: scope.actorId,
      },
    );

    await this.authRepository.createAuditLog(
      buildSubmissionAttachmentAuditEntry({
        scope,
        action: 'homework.submission_attachment.create',
        attachment,
      }),
    );

    return presentHomeworkSubmissionAttachmentDetail(attachment);
  }
}

@Injectable()
export class UpdateStudentHomeworkSubmissionAttachmentUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: StudentHomeworkSubmissionAttachmentCommand,
    dto: UpdateHomeworkSubmissionAttachmentDto,
  ): Promise<HomeworkSubmissionAttachmentDetailResponseDto> {
    const scope = requireHomeworkScope();
    const { target, submission, attachment } =
      await requireEditableStudentAttachment(this.homeworkRepository, command);
    const data: UpdateHomeworkSubmissionAttachmentData = {};
    if (hasOwn(dto, 'title')) data.title = normalizeNullableText(dto.title);
    if (hasOwn(dto, 'description')) {
      data.description = normalizeNullableText(dto.description);
    }

    const updated = await this.homeworkRepository.updateSubmissionAttachment({
      homeworkAssignmentId: target.homeworkAssignmentId,
      submissionId: submission.id,
      attachmentId: attachment.id,
      data,
    });

    await this.authRepository.createAuditLog(
      buildSubmissionAttachmentAuditEntry({
        scope,
        action: 'homework.submission_attachment.update',
        attachment: updated,
        before: summarizeSubmissionAttachmentForAudit(attachment),
      }),
    );

    return presentHomeworkSubmissionAttachmentDetail(updated);
  }
}

@Injectable()
export class ReorderStudentHomeworkSubmissionAttachmentUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: StudentHomeworkSubmissionAttachmentCommand,
    dto: ReorderHomeworkSubmissionAttachmentDto,
  ): Promise<HomeworkSubmissionAttachmentDetailResponseDto> {
    const scope = requireHomeworkScope();
    if (!Number.isInteger(dto.sortOrder) || dto.sortOrder < 0) {
      throw new HomeworkSubmissionAttachmentInvalidReorderException({
        attachmentId: command.attachmentId,
        sortOrder: dto.sortOrder,
      });
    }

    const { target, submission, attachment } =
      await requireEditableStudentAttachment(this.homeworkRepository, command);
    const updated = await this.homeworkRepository.updateSubmissionAttachment({
      homeworkAssignmentId: target.homeworkAssignmentId,
      submissionId: submission.id,
      attachmentId: attachment.id,
      data: { sortOrder: dto.sortOrder },
    });

    await this.authRepository.createAuditLog(
      buildSubmissionAttachmentAuditEntry({
        scope,
        action: 'homework.submission_attachment.reorder',
        attachment: updated,
        before: summarizeSubmissionAttachmentForAudit(attachment),
      }),
    );

    return presentHomeworkSubmissionAttachmentDetail(updated);
  }
}

@Injectable()
export class DeleteStudentHomeworkSubmissionAttachmentUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: StudentHomeworkSubmissionAttachmentCommand,
  ): Promise<void> {
    const scope = requireHomeworkScope();
    const { target, submission, attachment } =
      await requireEditableStudentAttachment(this.homeworkRepository, command);

    await this.homeworkRepository.softDeleteSubmissionAttachment({
      homeworkAssignmentId: target.homeworkAssignmentId,
      submissionId: submission.id,
      attachmentId: attachment.id,
    });
    await this.authRepository.createAuditLog(
      buildSubmissionAttachmentAuditEntry({
        scope,
        action: 'homework.submission_attachment.delete',
        attachment,
      }),
    );
  }
}

async function requireSubmissionInAssignment(
  repository: HomeworkRepository,
  input: { homeworkId: string; submissionId: string },
): Promise<HomeworkSubmissionRecord> {
  const submission = await repository.findSubmissionById({
    homeworkAssignmentId: input.homeworkId,
    submissionId: input.submissionId,
  });
  if (!submission) {
    throw new HomeworkAnswerInvalidSubmissionScopeException(input);
  }

  return submission;
}

async function findStudentTargetOrThrow(
  repository: HomeworkRepository,
  command: StudentHomeworkSubmissionAttachmentsCommand,
): Promise<HomeworkTargetForSubmissionRecord> {
  const target = await repository.findStudentTargetForSubmission(command);
  if (!target) {
    throw new HomeworkAnswerInvalidSubmissionScopeException({
      homeworkId: command.homeworkId,
    });
  }

  return target;
}

async function requireEditableStudentAttachment(
  repository: HomeworkRepository,
  command: StudentHomeworkSubmissionAttachmentCommand,
): Promise<{
  target: HomeworkTargetForSubmissionRecord;
  submission: HomeworkSubmissionRecord;
  attachment: HomeworkSubmissionAttachmentRecord;
}> {
  const target = await findStudentTargetOrThrow(repository, command);
  assertSubmissionAttachmentsEditable(target);
  const submission = target.submissions[0];
  if (!submission) {
    throw new HomeworkSubmissionAttachmentNotFoundException({ ...command });
  }

  const attachment = await repository.findSubmissionAttachmentById({
    homeworkAssignmentId: target.homeworkAssignmentId,
    submissionId: submission.id,
    attachmentId: command.attachmentId,
  });
  if (!attachment) {
    throw new HomeworkSubmissionAttachmentNotFoundException({ ...command });
  }

  return { target, submission, attachment };
}

function assertSubmissionAttachmentsEditable(
  target: HomeworkTargetForSubmissionRecord,
): void {
  if (target.homeworkAssignment.status !== HomeworkAssignmentStatus.PUBLISHED) {
    throw new HomeworkSubmissionAttachmentReadOnlyException({
      homeworkId: target.homeworkAssignmentId,
      assignmentStatus: target.homeworkAssignment.status,
    });
  }

  if (
    target.status === HomeworkTargetStatus.SUBMITTED ||
    target.status === HomeworkTargetStatus.LATE ||
    target.status === HomeworkTargetStatus.REVIEWED ||
    target.status === HomeworkTargetStatus.MISSING ||
    target.status === HomeworkTargetStatus.EXCUSED
  ) {
    throw new HomeworkSubmissionAttachmentReadOnlyException({
      homeworkId: target.homeworkAssignmentId,
      targetStatus: target.status,
    });
  }

  const submission = target.submissions[0];
  if (submission && submission.status !== HomeworkSubmissionStatus.DRAFT) {
    throw new HomeworkSubmissionAttachmentReadOnlyException({
      homeworkId: target.homeworkAssignmentId,
      submissionId: submission.id,
      submissionStatus: submission.status,
    });
  }
}

async function resolveDraftSubmissionOrThrow(
  repository: HomeworkRepository,
  target: HomeworkTargetForSubmissionRecord,
): Promise<HomeworkSubmissionRecord> {
  const result = await repository.resolveDraftSubmission({
    schoolId: target.schoolId,
    homeworkAssignmentId: target.homeworkAssignmentId,
    homeworkTargetId: target.id,
    studentId: target.studentId,
    enrollmentId: target.enrollmentId,
  });

  if (result.outcome === 'already_submitted') {
    throw new HomeworkSubmissionAttachmentReadOnlyException({
      homeworkId: target.homeworkAssignmentId,
      submissionId: result.submission.id,
      submissionStatus: result.submission.status,
    });
  }

  return result.submission;
}

function normalizeNullableText(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function buildSubmissionAttachmentAuditEntry(input: {
  scope: HomeworkScope;
  action: string;
  attachment: HomeworkSubmissionAttachmentRecord;
  before?: Record<string, unknown>;
}) {
  return {
    actorId: input.scope.actorId,
    userType: input.scope.userType,
    organizationId: input.scope.organizationId,
    schoolId: input.scope.schoolId,
    module: 'homework',
    action: input.action,
    resourceType: 'homework_submission_attachment',
    resourceId: input.attachment.id,
    outcome: AuditOutcome.SUCCESS,
    before: input.before,
    after: summarizeSubmissionAttachmentForAudit(input.attachment),
  };
}

function summarizeSubmissionAttachmentForAudit(
  attachment: HomeworkSubmissionAttachmentRecord,
): Record<string, unknown> {
  return {
    id: attachment.id,
    homeworkAssignmentId: attachment.homeworkAssignmentId,
    homeworkSubmissionId: attachment.homeworkSubmissionId,
    fileId: attachment.fileId,
    sortOrder: attachment.sortOrder,
  };
}

function hasOwn<T extends object>(object: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}
