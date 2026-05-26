export interface HomeworkSubmissionAttachmentInput {
  fileId: string;
  title?: string | null;
  description?: string | null;
  sortOrder?: number | null;
}

export interface UpdateHomeworkSubmissionAttachmentInput {
  title?: string | null;
  description?: string | null;
}
