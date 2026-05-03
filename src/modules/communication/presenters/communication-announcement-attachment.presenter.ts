import {
  CommunicationAnnouncementAttachmentListResult,
  CommunicationAnnouncementAttachmentRecord,
} from '../infrastructure/communication-announcement.repository';

export interface CommunicationAnnouncementAttachmentResponse {
  id: string;
  announcementId: string;
  fileId: string;
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

export function presentCommunicationAnnouncementAttachmentList(
  result: CommunicationAnnouncementAttachmentListResult,
) {
  return {
    announcementId: result.announcementId,
    items: result.items.map((attachment) =>
      presentCommunicationAnnouncementAttachment(attachment),
    ),
  };
}

export function presentCommunicationAnnouncementAttachment(
  attachment: CommunicationAnnouncementAttachmentRecord,
): CommunicationAnnouncementAttachmentResponse {
  return {
    id: attachment.id,
    announcementId: attachment.announcementId,
    fileId: attachment.fileId,
    createdById: attachment.createdById,
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

export function summarizeCommunicationAnnouncementAttachmentForAudit(
  attachment: CommunicationAnnouncementAttachmentRecord,
): Record<string, unknown> {
  return {
    id: attachment.id,
    announcementId: attachment.announcementId,
    fileId: attachment.fileId,
    createdById: attachment.createdById,
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
