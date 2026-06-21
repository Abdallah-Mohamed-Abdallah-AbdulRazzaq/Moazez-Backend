export type CommunicationAppAttachmentAliasStyle = 'camel' | 'dual';

export type CommunicationAppAttachmentMediaKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'file';

export interface CommunicationAppAttachmentRecord {
  id: string;
  fileId: string;
  caption: string | null;
  sortOrder: number;
  createdAt: Date;
  file: {
    originalName: string | null;
    mimeType: string | null;
    sizeBytes: bigint | number | string;
  };
}

export interface CommunicationAppAttachmentCamelResponse {
  attachmentId: string;
  fileId: string;
  displayName: string | null;
  mimeType: string | null;
  sizeBytes: string;
  mediaKind: CommunicationAppAttachmentMediaKind;
  caption: string | null;
  sortOrder: number;
  createdAt: string;
  downloadPath: string;
}

export interface CommunicationAppAttachmentDualResponse
  extends CommunicationAppAttachmentCamelResponse {
  attachment_id: string;
  file_id: string;
  display_name: string | null;
  mime_type: string | null;
  size_bytes: string;
  media_kind: CommunicationAppAttachmentMediaKind;
  sort_order: number;
  created_at: string;
  download_path: string;
}

export type CommunicationAppAttachmentResponse =
  | CommunicationAppAttachmentCamelResponse
  | CommunicationAppAttachmentDualResponse;

export function presentCommunicationAppMessageAttachments(
  attachments: CommunicationAppAttachmentRecord[],
  params: { aliasStyle: 'camel' },
): CommunicationAppAttachmentCamelResponse[];
export function presentCommunicationAppMessageAttachments(
  attachments: CommunicationAppAttachmentRecord[],
  params: { aliasStyle: 'dual' },
): CommunicationAppAttachmentDualResponse[];
export function presentCommunicationAppMessageAttachments(
  attachments: CommunicationAppAttachmentRecord[],
  params: { aliasStyle: CommunicationAppAttachmentAliasStyle },
): CommunicationAppAttachmentResponse[];
export function presentCommunicationAppMessageAttachments(
  attachments: CommunicationAppAttachmentRecord[],
  params: { aliasStyle: CommunicationAppAttachmentAliasStyle },
): CommunicationAppAttachmentResponse[] {
  return attachments.map((attachment) =>
    presentCommunicationAppMessageAttachment(attachment, params),
  );
}

export function presentCommunicationAppMessageAttachment(
  attachment: CommunicationAppAttachmentRecord,
  params: { aliasStyle: 'camel' },
): CommunicationAppAttachmentCamelResponse;
export function presentCommunicationAppMessageAttachment(
  attachment: CommunicationAppAttachmentRecord,
  params: { aliasStyle: 'dual' },
): CommunicationAppAttachmentDualResponse;
export function presentCommunicationAppMessageAttachment(
  attachment: CommunicationAppAttachmentRecord,
  params: { aliasStyle: CommunicationAppAttachmentAliasStyle },
): CommunicationAppAttachmentResponse;
export function presentCommunicationAppMessageAttachment(
  attachment: CommunicationAppAttachmentRecord,
  params: { aliasStyle: CommunicationAppAttachmentAliasStyle },
): CommunicationAppAttachmentResponse {
  const camel: CommunicationAppAttachmentCamelResponse = {
    attachmentId: attachment.id,
    fileId: attachment.fileId,
    displayName: attachment.file.originalName,
    mimeType: attachment.file.mimeType,
    sizeBytes: attachment.file.sizeBytes.toString(),
    mediaKind: deriveCommunicationAppAttachmentMediaKind(
      attachment.file.mimeType,
    ),
    caption: attachment.caption,
    sortOrder: attachment.sortOrder,
    createdAt: attachment.createdAt.toISOString(),
    downloadPath: buildCommunicationAppAttachmentDownloadPath(
      attachment.fileId,
    ),
  };

  if (params.aliasStyle === 'camel') {
    return camel;
  }

  return {
    ...camel,
    attachment_id: camel.attachmentId,
    file_id: camel.fileId,
    display_name: camel.displayName,
    mime_type: camel.mimeType,
    size_bytes: camel.sizeBytes,
    media_kind: camel.mediaKind,
    sort_order: camel.sortOrder,
    created_at: camel.createdAt,
    download_path: camel.downloadPath,
  };
}

export function deriveCommunicationAppAttachmentMediaKind(
  mimeType: string | null | undefined,
): CommunicationAppAttachmentMediaKind {
  const normalized = mimeType?.trim().toLowerCase() ?? '';

  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('video/')) return 'video';
  if (normalized.startsWith('audio/')) return 'audio';

  return 'file';
}

export function buildCommunicationAppAttachmentDownloadPath(
  fileId: string,
): string {
  return `/api/v1/files/${fileId}/download`;
}
