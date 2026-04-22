import { Injectable } from '@nestjs/common';
import {
  AttachmentResponseDto,
  CreateAttachmentDto,
} from '../dto/link-attachment.dto';
import {
  AttachmentLinkConflictException,
  isAttachmentUniqueConstraintError,
} from '../domain/attachment.exceptions';
import { AttachmentsRepository } from '../infrastructure/attachments.repository';
import { presentAttachment } from '../presenters/attachment.presenter';
import { validateAttachmentTarget } from '../validators/attachment-target.validator';
import { FilesRepository } from '../../uploads/infrastructure/files.repository';
import { FilesNotFoundException } from '../../uploads/domain/file-upload.exceptions';
import { requireAttachmentsScope } from '../attachments-scope';

@Injectable()
export class LinkAttachmentUseCase {
  constructor(
    private readonly attachmentsRepository: AttachmentsRepository,
    private readonly filesRepository: FilesRepository,
  ) {}

  async execute(
    command: CreateAttachmentDto,
  ): Promise<AttachmentResponseDto> {
    const scope = requireAttachmentsScope();
    const target = validateAttachmentTarget(
      command.resourceType,
      command.resourceId,
    );
    const file = await this.filesRepository.findScopedFileById(command.fileId);
    if (!file) {
      throw new FilesNotFoundException({ fileId: command.fileId });
    }

    try {
      const attachment = await this.attachmentsRepository.createAttachment({
        fileId: command.fileId,
        schoolId: scope.schoolId,
        resourceType: target.resourceType,
        resourceId: target.resourceId,
        createdById: scope.actorId,
      });

      return presentAttachment(attachment);
    } catch (error) {
      if (isAttachmentUniqueConstraintError(error)) {
        throw new AttachmentLinkConflictException();
      }

      throw error;
    }
  }
}
