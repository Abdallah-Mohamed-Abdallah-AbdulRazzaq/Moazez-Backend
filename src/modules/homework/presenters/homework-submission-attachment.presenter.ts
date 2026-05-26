import {
  HomeworkSubmissionAttachmentDetailResponseDto,
  HomeworkSubmissionAttachmentResponseDto,
  HomeworkSubmissionAttachmentsListResponseDto,
} from '../dto/homework-submission-attachment-response.dto';

export interface HomeworkSubmissionAttachmentPresenterModel {
  id: string;
  homeworkAssignmentId: string;
  homeworkSubmissionId: string;
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

export function presentHomeworkSubmissionAttachment(
  attachment: HomeworkSubmissionAttachmentPresenterModel,
): HomeworkSubmissionAttachmentResponseDto {
  return {
    attachmentId: attachment.id,
    homeworkId: attachment.homeworkAssignmentId,
    submissionId: attachment.homeworkSubmissionId,
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

export function presentHomeworkSubmissionAttachments(
  attachments: HomeworkSubmissionAttachmentPresenterModel[],
): HomeworkSubmissionAttachmentsListResponseDto {
  return {
    items: attachments.map((attachment) =>
      presentHomeworkSubmissionAttachment(attachment),
    ),
  };
}

export function presentHomeworkSubmissionAttachmentDetail(
  attachment: HomeworkSubmissionAttachmentPresenterModel,
): HomeworkSubmissionAttachmentDetailResponseDto {
  return { attachment: presentHomeworkSubmissionAttachment(attachment) };
}
