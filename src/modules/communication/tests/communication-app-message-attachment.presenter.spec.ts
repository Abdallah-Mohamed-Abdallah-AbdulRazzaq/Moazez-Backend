import {
  deriveCommunicationAppAttachmentMediaKind,
  presentCommunicationAppMessageAttachment,
} from '../presenters/communication-app-message-attachment.presenter';

describe('Communication app message attachment presenter', () => {
  it.each([
    ['image/jpeg', 'image'],
    ['video/mp4', 'video'],
    ['audio/mpeg', 'audio'],
    ['application/pdf', 'file'],
    ['text/plain', 'file'],
    ['application/octet-stream', 'file'],
    [null, 'file'],
  ] as const)('maps %s to %s media kind', (mimeType, mediaKind) => {
    expect(deriveCommunicationAppAttachmentMediaKind(mimeType)).toBe(mediaKind);
  });

  it('presents dual aliases without leaking storage or audit fields', () => {
    const result = presentCommunicationAppMessageAttachment(
      {
        id: 'attachment-1',
        fileId: 'file-1',
        caption: 'Worksheet',
        sortOrder: 2,
        createdAt: new Date('2026-06-21T10:00:00.000Z'),
        file: {
          originalName: 'worksheet.pdf',
          mimeType: 'application/pdf',
          sizeBytes: BigInt(123456),
          bucket: 'private-bucket',
          objectKey: 'objects/file-1',
          storageKey: 'storage/file-1',
          metadata: { unsafe: true },
          providerMetadata: { provider: 's3' },
          virusScan: { status: 'pending' },
          signedUrl: 'https://storage.example/file-1',
          deletedAt: new Date('2026-06-21T10:05:00.000Z'),
        } as any,
        uploadedById: 'user-1',
        createdById: 'user-1',
        ownerId: 'owner-1',
        schoolId: 'school-1',
        organizationId: 'org-1',
        membershipId: 'membership-1',
        roleId: 'role-1',
        deletedAt: new Date('2026-06-21T10:05:00.000Z'),
      } as any,
      { aliasStyle: 'dual' },
    );
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      attachmentId: 'attachment-1',
      attachment_id: 'attachment-1',
      fileId: 'file-1',
      file_id: 'file-1',
      displayName: 'worksheet.pdf',
      display_name: 'worksheet.pdf',
      mimeType: 'application/pdf',
      mime_type: 'application/pdf',
      sizeBytes: '123456',
      size_bytes: '123456',
      mediaKind: 'file',
      media_kind: 'file',
      caption: 'Worksheet',
      sortOrder: 2,
      sort_order: 2,
      createdAt: '2026-06-21T10:00:00.000Z',
      created_at: '2026-06-21T10:00:00.000Z',
      downloadPath: '/api/v1/files/file-1/download',
      download_path: '/api/v1/files/file-1/download',
    });
    for (const forbidden of [
      'uploadedById',
      'createdById',
      'bucket',
      'objectKey',
      'storageKey',
      'signedUrl',
      'metadata',
      'providerMetadata',
      'virusScan',
      'ownerId',
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'deletedAt',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('presents camelCase only for teacher-style payloads', () => {
    const result = presentCommunicationAppMessageAttachment(
      {
        id: 'attachment-1',
        fileId: 'file-1',
        caption: null,
        sortOrder: 0,
        createdAt: new Date('2026-06-21T10:00:00.000Z'),
        file: {
          originalName: 'photo.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 99,
        },
      },
      { aliasStyle: 'camel' },
    );

    expect(result).toMatchObject({
      attachmentId: 'attachment-1',
      fileId: 'file-1',
      displayName: 'photo.jpg',
      mediaKind: 'image',
      downloadPath: '/api/v1/files/file-1/download',
    });
    expect(result).not.toHaveProperty('attachment_id');
    expect(result).not.toHaveProperty('download_path');
  });

  it('adds app-specific authorized paths when route context is provided', () => {
    const result = presentCommunicationAppMessageAttachment(
      {
        id: 'attachment-1',
        fileId: 'file-1',
        caption: null,
        sortOrder: 0,
        createdAt: new Date('2026-06-21T10:00:00.000Z'),
        file: {
          originalName: 'photo.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 99,
        },
      },
      {
        aliasStyle: 'dual',
        authorizedRoute: {
          surface: 'parent',
          conversationId: 'conversation-1',
          messageId: 'message-1',
        },
      },
    );

    expect(result).toMatchObject({
      downloadPath: '/api/v1/files/file-1/download',
      download_path: '/api/v1/files/file-1/download',
      authorizedDownloadPath:
        '/api/v1/parent/messages/conversations/conversation-1/messages/message-1/attachments/attachment-1/download',
      authorized_download_path:
        '/api/v1/parent/messages/conversations/conversation-1/messages/message-1/attachments/attachment-1/download',
      previewPath:
        '/api/v1/parent/messages/conversations/conversation-1/messages/message-1/attachments/attachment-1/preview',
      preview_path:
        '/api/v1/parent/messages/conversations/conversation-1/messages/message-1/attachments/attachment-1/preview',
    });
  });
});
