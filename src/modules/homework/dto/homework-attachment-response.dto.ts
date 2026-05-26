export class HomeworkAttachmentFileSummaryDto {
  filename!: string;
  mimeType!: string;
  sizeBytes!: string;
}

export class HomeworkAttachmentResponseDto {
  attachmentId!: string;
  homeworkId!: string;
  fileId!: string;
  title!: string | null;
  description!: string | null;
  sortOrder!: number;
  file!: HomeworkAttachmentFileSummaryDto;
  createdAt!: string;
  updatedAt!: string;
}

export class HomeworkAttachmentsListResponseDto {
  items!: HomeworkAttachmentResponseDto[];
}

export class HomeworkAttachmentDetailResponseDto {
  attachment!: HomeworkAttachmentResponseDto;
}
