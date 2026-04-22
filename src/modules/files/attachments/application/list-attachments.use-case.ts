import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import {
  AttachmentResponseDto,
  ListAttachmentsQueryDto,
} from '../dto/link-attachment.dto';
import { requireAttachmentsScope } from '../attachments-scope';
import { AttachmentsRepository } from '../infrastructure/attachments.repository';
import { presentAttachment } from '../presenters/attachment.presenter';
import { validateAttachmentTarget } from '../validators/attachment-target.validator';

@Injectable()
export class ListAttachmentsUseCase {
  constructor(
    private readonly attachmentsRepository: AttachmentsRepository,
  ) {}

  async execute(
    query: ListAttachmentsQueryDto,
  ): Promise<AttachmentResponseDto[]> {
    requireAttachmentsScope();

    const target = validateAttachmentTarget(
      query.resourceType,
      query.resourceId,
    );

    const attachments =
      await this.attachmentsRepository.listAttachmentsForResource(target);
    if (attachments.length === 0) {
      throw new NotFoundDomainException('Attachments not found', target);
    }

    return attachments.map((attachment) => presentAttachment(attachment));
  }
}
