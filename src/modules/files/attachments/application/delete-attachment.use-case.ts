import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireAttachmentsScope } from '../attachments-scope';
import { DeleteAttachmentResponseDto } from '../dto/link-attachment.dto';
import { AttachmentsRepository } from '../infrastructure/attachments.repository';

@Injectable()
export class DeleteAttachmentUseCase {
  constructor(
    private readonly attachmentsRepository: AttachmentsRepository,
  ) {}

  async execute(
    attachmentId: string,
  ): Promise<DeleteAttachmentResponseDto> {
    requireAttachmentsScope();

    const attachment =
      await this.attachmentsRepository.findAttachmentById(attachmentId);
    if (!attachment) {
      throw new NotFoundDomainException('Attachment not found', {
        attachmentId,
      });
    }

    const result = await this.attachmentsRepository.deleteAttachment(
      attachmentId,
    );
    if (result.status === 'not_found') {
      throw new NotFoundDomainException('Attachment not found', {
        attachmentId,
      });
    }

    return { ok: true };
  }
}
