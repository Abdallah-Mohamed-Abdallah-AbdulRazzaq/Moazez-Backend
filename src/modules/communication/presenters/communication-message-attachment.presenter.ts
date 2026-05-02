import {
  CommunicationMessageAttachmentListResult,
  CommunicationMessageAttachmentRecord,
} from '../infrastructure/communication-message-attachment.repository';

export interface CommunicationMessageAttachmentResponse {
  id: string;
  messageId: string;
  fileId: string;
  uploadedById: string | null;
  createdById: string | null;
  caption: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  file: {
    id: string;
    filename: string;
    displayName: string;
    mimeType: string;
    sizeBytes: string;
  };
}

export function presentCommunicationMessageAttachmentList(
  result: CommunicationMessageAttachmentListResult,
) {
  return {
    messageId: result.messageId,
    items: result.items.map((attachment) =>
      presentCommunicationMessageAttachment(attachment),
    ),
  };
}

export function presentCommunicationMessageAttachment(
  attachment: CommunicationMessageAttachmentRecord,
): CommunicationMessageAttachmentResponse {
  return {
    id: attachment.id,
    messageId: attachment.messageId,
    fileId: attachment.fileId,
    uploadedById: attachment.uploadedById,
    createdById: attachment.uploadedById,
    caption: attachment.caption,
    sortOrder: attachment.sortOrder,
    createdAt: attachment.createdAt.toISOString(),
    updatedAt: attachment.updatedAt.toISOString(),
    file: {
      id: attachment.file.id,
      filename: attachment.file.originalName,
      displayName: attachment.file.originalName,
      mimeType: attachment.file.mimeType,
      sizeBytes: attachment.file.sizeBytes.toString(),
    },
  };
}

export function summarizeCommunicationMessageAttachmentForAudit(
  attachment: CommunicationMessageAttachmentRecord,
): Record<string, unknown> {
  return {
    id: attachment.id,
    conversationId: attachment.conversationId,
    messageId: attachment.messageId,
    fileId: attachment.fileId,
    uploadedById: attachment.uploadedById,
    captionLength: attachment.caption?.length ?? 0,
    sortOrder: attachment.sortOrder,
    file: {
      id: attachment.file.id,
      originalName: attachment.file.originalName,
      mimeType: attachment.file.mimeType,
      sizeBytes: attachment.file.sizeBytes.toString(),
    },
    createdAt: attachment.createdAt.toISOString(),
    updatedAt: attachment.updatedAt.toISOString(),
  };
}
