import { Injectable } from '@nestjs/common';
import { AuditOutcome, HomeworkAssignmentStatus } from '@prisma/client';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import { HomeworkScope, requireHomeworkScope } from '../homework-context';
import {
  CreateHomeworkAttachmentDto,
  ReorderHomeworkAttachmentDto,
  UpdateHomeworkAttachmentDto,
} from '../dto/homework-attachment.dto';
import {
  HomeworkAttachmentDetailResponseDto,
  HomeworkAttachmentsListResponseDto,
} from '../dto/homework-attachment-response.dto';
import {
  HomeworkAttachmentFileNotFoundException,
  HomeworkAttachmentInvalidReorderException,
  HomeworkAttachmentNotFoundException,
  HomeworkAttachmentReadOnlyException,
} from '../domain/homework-attachment.exceptions';
import { HomeworkAssignmentNotFoundException } from '../domain/homework.exceptions';
import {
  HomeworkAssignmentWithCounters,
  HomeworkAttachmentRecord,
  HomeworkRepository,
  UpdateHomeworkAttachmentData,
} from '../infrastructure/homework.repository';
import {
  presentHomeworkAttachmentDetail,
  presentHomeworkAttachments,
} from '../presenters/homework-attachment.presenter';

@Injectable()
export class ListHomeworkAttachmentsUseCase {
  constructor(private readonly homeworkRepository: HomeworkRepository) {}

  async execute(
    homeworkId: string,
  ): Promise<HomeworkAttachmentsListResponseDto> {
    requireHomeworkScope();
    await findAssignmentOrThrow(this.homeworkRepository, homeworkId);
    const attachments = await this.homeworkRepository.listAttachments(
      homeworkId,
    );
    return presentHomeworkAttachments(attachments);
  }
}

@Injectable()
export class CreateHomeworkAttachmentUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    homeworkId: string,
    command: CreateHomeworkAttachmentDto,
  ): Promise<HomeworkAttachmentDetailResponseDto> {
    const scope = requireHomeworkScope();
    const assignment = await findAssignmentOrThrow(
      this.homeworkRepository,
      homeworkId,
    );
    assertAttachmentsMutable(assignment);
    const file = await this.homeworkRepository.findAttachmentFile(
      command.fileId,
    );
    if (!file || file.schoolId !== scope.schoolId || file.deletedAt) {
      throw new HomeworkAttachmentFileNotFoundException({
        fileId: command.fileId,
      });
    }

    const sortOrder =
      command.sortOrder ??
      (await this.homeworkRepository.getNextAttachmentSortOrder(homeworkId));
    const attachment = await this.homeworkRepository.createAttachment({
      schoolId: scope.schoolId,
      homeworkAssignmentId: homeworkId,
      fileId: file.id,
      title: normalizeNullableText(command.title),
      description: normalizeNullableText(command.description),
      sortOrder,
      createdByUserId: scope.actorId,
    });

    await this.authRepository.createAuditLog(
      buildAttachmentAuditEntry({
        scope,
        action: 'homework.attachment.create',
        attachment,
      }),
    );

    return presentHomeworkAttachmentDetail(attachment);
  }
}

@Injectable()
export class UpdateHomeworkAttachmentUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    homeworkId: string,
    attachmentId: string,
    command: UpdateHomeworkAttachmentDto,
  ): Promise<HomeworkAttachmentDetailResponseDto> {
    const scope = requireHomeworkScope();
    const assignment = await findAssignmentOrThrow(
      this.homeworkRepository,
      homeworkId,
    );
    assertAttachmentsMutable(assignment);
    const existing = await findAttachmentOrThrow(this.homeworkRepository, {
      homeworkId,
      attachmentId,
    });
    const data: UpdateHomeworkAttachmentData = {};
    if (hasOwn(command, 'title')) {
      data.title = normalizeNullableText(command.title);
    }
    if (hasOwn(command, 'description')) {
      data.description = normalizeNullableText(command.description);
    }

    const attachment = await this.homeworkRepository.updateAttachment({
      homeworkId,
      attachmentId,
      data,
    });

    await this.authRepository.createAuditLog(
      buildAttachmentAuditEntry({
        scope,
        action: 'homework.attachment.update',
        attachment,
        before: summarizeAttachmentForAudit(existing),
      }),
    );

    return presentHomeworkAttachmentDetail(attachment);
  }
}

@Injectable()
export class ReorderHomeworkAttachmentUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    homeworkId: string,
    attachmentId: string,
    command: ReorderHomeworkAttachmentDto,
  ): Promise<HomeworkAttachmentDetailResponseDto> {
    const scope = requireHomeworkScope();
    const assignment = await findAssignmentOrThrow(
      this.homeworkRepository,
      homeworkId,
    );
    assertAttachmentsMutable(assignment);
    const existing = await findAttachmentOrThrow(this.homeworkRepository, {
      homeworkId,
      attachmentId,
    });
    if (!Number.isInteger(command.sortOrder) || command.sortOrder < 0) {
      throw new HomeworkAttachmentInvalidReorderException({
        homeworkId,
        attachmentId,
        sortOrder: command.sortOrder,
      });
    }

    const attachment = await this.homeworkRepository.updateAttachment({
      homeworkId,
      attachmentId,
      data: { sortOrder: command.sortOrder },
    });

    await this.authRepository.createAuditLog(
      buildAttachmentAuditEntry({
        scope,
        action: 'homework.attachment.reorder',
        attachment,
        before: summarizeAttachmentForAudit(existing),
      }),
    );

    return presentHomeworkAttachmentDetail(attachment);
  }
}

@Injectable()
export class DeleteHomeworkAttachmentUseCase {
  constructor(
    private readonly homeworkRepository: HomeworkRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(homeworkId: string, attachmentId: string): Promise<void> {
    const scope = requireHomeworkScope();
    const assignment = await findAssignmentOrThrow(
      this.homeworkRepository,
      homeworkId,
    );
    assertAttachmentsMutable(assignment);
    const existing = await findAttachmentOrThrow(this.homeworkRepository, {
      homeworkId,
      attachmentId,
    });

    await this.homeworkRepository.softDeleteAttachment({
      homeworkId,
      attachmentId,
    });
    await this.authRepository.createAuditLog(
      buildAttachmentAuditEntry({
        scope,
        action: 'homework.attachment.delete',
        attachment: existing,
      }),
    );
  }
}

async function findAssignmentOrThrow(
  repository: HomeworkRepository,
  homeworkId: string,
): Promise<HomeworkAssignmentWithCounters> {
  const assignment = await repository.findAssignmentById(homeworkId);
  if (!assignment) {
    throw new HomeworkAssignmentNotFoundException({ homeworkId });
  }

  return assignment;
}

async function findAttachmentOrThrow(
  repository: HomeworkRepository,
  input: { homeworkId: string; attachmentId: string },
): Promise<HomeworkAttachmentRecord> {
  const attachment = await repository.findAttachmentById(input);
  if (!attachment) {
    throw new HomeworkAttachmentNotFoundException(input);
  }

  return attachment;
}

function assertAttachmentsMutable(
  assignment: HomeworkAssignmentWithCounters,
): void {
  if (assignment.status === HomeworkAssignmentStatus.DRAFT) return;
  throw new HomeworkAttachmentReadOnlyException({
    homeworkId: assignment.id,
    status: assignment.status,
  });
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function buildAttachmentAuditEntry(input: {
  scope: HomeworkScope;
  action: string;
  attachment: HomeworkAttachmentRecord;
  before?: Record<string, unknown>;
}) {
  return {
    actorId: input.scope.actorId,
    userType: input.scope.userType,
    organizationId: input.scope.organizationId,
    schoolId: input.scope.schoolId,
    module: 'homework',
    action: input.action,
    resourceType: 'homework_assignment_attachment',
    resourceId: input.attachment.id,
    outcome: AuditOutcome.SUCCESS,
    before: input.before,
    after: summarizeAttachmentForAudit(input.attachment),
  };
}

function summarizeAttachmentForAudit(
  attachment: HomeworkAttachmentRecord,
): Record<string, unknown> {
  return {
    id: attachment.id,
    homeworkAssignmentId: attachment.homeworkAssignmentId,
    fileId: attachment.fileId,
    sortOrder: attachment.sortOrder,
  };
}

function hasOwn<T extends object>(object: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}
