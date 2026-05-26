import {
  HomeworkAttachmentDetailResponseDto,
  HomeworkAttachmentResponseDto,
  HomeworkAttachmentsListResponseDto,
} from '../dto/homework-attachment-response.dto';

export interface HomeworkAttachmentPresenterModel {
  id: string;
  homeworkAssignmentId: string;
  fileId: string;
  title: string | null;
  description: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  file: {
    originalName: string;
    mimeType: string;
    sizeBytes: bigint | number | string;
  };
}

export function presentHomeworkAttachment(
  attachment: HomeworkAttachmentPresenterModel,
): HomeworkAttachmentResponseDto {
  return {
    attachmentId: attachment.id,
    homeworkId: attachment.homeworkAssignmentId,
    fileId: attachment.fileId,
    title: attachment.title ?? attachment.file.originalName,
    description: attachment.description ?? null,
    sortOrder: attachment.sortOrder,
    file: {
      filename: attachment.file.originalName,
      mimeType: attachment.file.mimeType,
      sizeBytes: attachment.file.sizeBytes.toString(),
    },
    createdAt: attachment.createdAt.toISOString(),
    updatedAt: attachment.updatedAt.toISOString(),
  };
}

export function presentHomeworkAttachments(
  attachments: HomeworkAttachmentPresenterModel[],
): HomeworkAttachmentsListResponseDto {
  return {
    items: attachments.map((attachment) =>
      presentHomeworkAttachment(attachment),
    ),
  };
}

export function presentHomeworkAttachmentDetail(
  attachment: HomeworkAttachmentPresenterModel,
): HomeworkAttachmentDetailResponseDto {
  return { attachment: presentHomeworkAttachment(attachment) };
}
