import { Injectable } from '@nestjs/common';
import { CommunicationMessageStatus } from '@prisma/client';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { StorageService } from '../../../infrastructure/storage/storage.service';
import {
  CommunicationMessageAttachmentDownloadRecord,
  CommunicationMessageAttachmentRepository,
} from '../infrastructure/communication-message-attachment.repository';

export type CommunicationAttachmentAccessMode = 'download' | 'preview';

@Injectable()
export class GetCommunicationMessageAttachmentDownloadUrlUseCase {
  constructor(
    private readonly repository: CommunicationMessageAttachmentRepository,
    private readonly storageService: StorageService,
  ) {}

  async execute(input: {
    conversationId: string;
    messageId: string;
    attachmentId: string;
    mode: CommunicationAttachmentAccessMode;
  }): Promise<string> {
    const file = await this.resolveFile(input);
    const capability = await this.storageService.createDownloadUrl({
      bucket: file.bucket,
      objectKey: file.objectKey,
      expiresInSeconds: 5 * 60,
      disposition: 'attachment',
      downloadFileName: file.originalName,
    });
    return capability.url;
  }

  async resolveFile(input: {
    conversationId: string;
    messageId: string;
    attachmentId: string;
    mode: CommunicationAttachmentAccessMode;
  }): Promise<CommunicationMessageAttachmentDownloadRecord['file']> {
    const attachment =
      await this.repository.findCurrentSchoolMessageAttachmentForDownload({
        conversationId: input.conversationId,
        messageId: input.messageId,
        attachmentId: input.attachmentId,
      });

    assertAttachmentIsDownloadable(attachment, input);

    return attachment.file;
  }
}

function assertAttachmentIsDownloadable(
  attachment: CommunicationMessageAttachmentDownloadRecord | null,
  input: {
    conversationId: string;
    messageId: string;
    attachmentId: string;
    mode: CommunicationAttachmentAccessMode;
  },
): asserts attachment is CommunicationMessageAttachmentDownloadRecord {
  if (!attachment) {
    throw attachmentNotFound(input);
  }

  if (
    attachment.conversationId !== input.conversationId ||
    attachment.messageId !== input.messageId ||
    attachment.message.id !== input.messageId ||
    attachment.message.conversationId !== input.conversationId
  ) {
    throw attachmentNotFound(input);
  }

  if (
    attachment.deletedAt ||
    attachment.message.deletedAt ||
    attachment.message.hiddenAt ||
    attachment.message.status === CommunicationMessageStatus.DELETED ||
    attachment.message.status === CommunicationMessageStatus.HIDDEN
  ) {
    throw attachmentNotFound(input);
  }

  if (
    attachment.file.deletedAt ||
    attachment.file.schoolId !== attachment.schoolId
  ) {
    throw attachmentNotFound(input);
  }
}

function attachmentNotFound(input: {
  conversationId: string;
  messageId: string;
  attachmentId: string;
  mode: CommunicationAttachmentAccessMode;
}): NotFoundDomainException {
  return new NotFoundDomainException('Message attachment not found', {
    conversationId: input.conversationId,
    messageId: input.messageId,
    attachmentId: input.attachmentId,
    mode: input.mode,
  });
}
