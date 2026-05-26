export interface CreateHomeworkAttachmentInput {
  fileId: string;
  title?: string | null;
  description?: string | null;
  sortOrder?: number | null;
}

export interface UpdateHomeworkAttachmentInput {
  title?: string | null;
  description?: string | null;
}

export interface ReorderHomeworkAttachmentInput {
  sortOrder: number;
}
