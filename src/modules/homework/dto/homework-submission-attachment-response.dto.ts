export class HomeworkSubmissionAttachmentFileDto {
  filename!: string;
  mimeType!: string;
  sizeBytes!: string;
}

export class HomeworkSubmissionAttachmentResponseDto {
  attachmentId!: string;
  homeworkId!: string;
  submissionId!: string;
  fileId!: string;
  title!: string | null;
  description!: string | null;
  sortOrder!: number;
  file!: HomeworkSubmissionAttachmentFileDto;
  createdAt!: string;
  updatedAt!: string;
}

export class HomeworkSubmissionAttachmentsListResponseDto {
  items!: HomeworkSubmissionAttachmentResponseDto[];
}

export class HomeworkSubmissionAttachmentDetailResponseDto {
  attachment!: HomeworkSubmissionAttachmentResponseDto;
}
