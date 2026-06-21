export type CommunicationAppAttachmentAliasStyle = 'camel' | 'dual';
export type CommunicationAppAttachmentSurface = 'parent' | 'student' | 'teacher';

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
  authorizedDownloadPath?: string;
  previewPath?: string;
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
  authorized_download_path?: string;
  preview_path?: string;
}

export type CommunicationAppAttachmentResponse =
  | CommunicationAppAttachmentCamelResponse
  | CommunicationAppAttachmentDualResponse;

export function presentCommunicationAppMessageAttachments(
  attachments: CommunicationAppAttachmentRecord[],
  params: CommunicationAppAttachmentPresenterParams & { aliasStyle: 'camel' },
): CommunicationAppAttachmentCamelResponse[];
export function presentCommunicationAppMessageAttachments(
  attachments: CommunicationAppAttachmentRecord[],
  params: CommunicationAppAttachmentPresenterParams & { aliasStyle: 'dual' },
): CommunicationAppAttachmentDualResponse[];
export function presentCommunicationAppMessageAttachments(
  attachments: CommunicationAppAttachmentRecord[],
  params: CommunicationAppAttachmentPresenterParams,
): CommunicationAppAttachmentResponse[];
export function presentCommunicationAppMessageAttachments(
  attachments: CommunicationAppAttachmentRecord[],
  params: CommunicationAppAttachmentPresenterParams,
): CommunicationAppAttachmentResponse[] {
  return attachments.map((attachment) =>
    presentCommunicationAppMessageAttachment(attachment, params),
  );
}

export function presentCommunicationAppMessageAttachment(
  attachment: CommunicationAppAttachmentRecord,
  params: CommunicationAppAttachmentPresenterParams & { aliasStyle: 'camel' },
): CommunicationAppAttachmentCamelResponse;
export function presentCommunicationAppMessageAttachment(
  attachment: CommunicationAppAttachmentRecord,
  params: CommunicationAppAttachmentPresenterParams & { aliasStyle: 'dual' },
): CommunicationAppAttachmentDualResponse;
export function presentCommunicationAppMessageAttachment(
  attachment: CommunicationAppAttachmentRecord,
  params: CommunicationAppAttachmentPresenterParams,
): CommunicationAppAttachmentResponse;
export function presentCommunicationAppMessageAttachment(
  attachment: CommunicationAppAttachmentRecord,
  params: CommunicationAppAttachmentPresenterParams,
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
  const authorizedPath = buildCommunicationAppAttachmentAuthorizedPaths(
    attachment.id,
    params.authorizedRoute,
  );

  if (authorizedPath) {
    camel.authorizedDownloadPath = authorizedPath.downloadPath;
    camel.previewPath = authorizedPath.previewPath;
  }

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
    ...(camel.authorizedDownloadPath
      ? { authorized_download_path: camel.authorizedDownloadPath }
      : {}),
    ...(camel.previewPath ? { preview_path: camel.previewPath } : {}),
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

export interface CommunicationAppAttachmentPresenterParams {
  aliasStyle: CommunicationAppAttachmentAliasStyle;
  authorizedRoute?: {
    surface: CommunicationAppAttachmentSurface;
    conversationId: string;
    messageId: string;
  };
}

export function buildCommunicationAppAttachmentAuthorizedPaths(
  attachmentId: string,
  route: CommunicationAppAttachmentPresenterParams['authorizedRoute'],
):
  | {
      downloadPath: string;
      previewPath: string;
    }
  | null {
  if (!route) return null;

  const basePath =
    `/api/v1/${route.surface}/messages/conversations/${route.conversationId}` +
    `/messages/${route.messageId}/attachments/${attachmentId}`;

  return {
    downloadPath: `${basePath}/download`,
    previewPath: `${basePath}/preview`,
  };
}
