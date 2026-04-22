import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { DeleteAttachmentUseCase } from './application/delete-attachment.use-case';
import { ListAttachmentsUseCase } from './application/list-attachments.use-case';
import { LinkAttachmentUseCase } from './application/link-attachment.use-case';
import { AttachmentsController } from './controller/attachments.controller';
import { AttachmentsRepository } from './infrastructure/attachments.repository';

@Module({
  imports: [UploadsModule],
  controllers: [AttachmentsController],
  providers: [
    AttachmentsRepository,
    LinkAttachmentUseCase,
    ListAttachmentsUseCase,
    DeleteAttachmentUseCase,
  ],
  exports: [
    AttachmentsRepository,
    LinkAttachmentUseCase,
    ListAttachmentsUseCase,
    DeleteAttachmentUseCase,
  ],
})
export class AttachmentsModule {}
