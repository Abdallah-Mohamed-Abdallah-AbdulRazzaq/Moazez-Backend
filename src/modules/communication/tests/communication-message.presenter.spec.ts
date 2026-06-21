import {
  CommunicationMessageKind,
  CommunicationMessageStatus,
} from '@prisma/client';
import { CommunicationMessageRecord } from '../infrastructure/communication-message.repository';
import {
  presentCommunicationMessage,
  presentCommunicationMessageList,
  summarizeCommunicationMessageForAudit,
} from '../presenters/communication-message.presenter';

describe('communication message presenter', () => {
  it('maps enum values to lowercase and never exposes schoolId', () => {
    const presented = presentCommunicationMessage(
      messageRecord({
        kind: CommunicationMessageKind.TEXT,
        status: CommunicationMessageStatus.SENT,
      }),
    );
    const json = JSON.stringify(presented);

    expect(presented.type).toBe('text');
    expect(presented.status).toBe('sent');
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('school-1');
  });

  it('hides deleted and hidden body content', () => {
    expect(
      presentCommunicationMessage(
        messageRecord({
          status: CommunicationMessageStatus.DELETED,
          body: 'deleted secret',
          deletedAt: new Date('2026-05-02T09:00:00.000Z'),
        }),
      ).body,
    ).toBeNull();
    expect(
      presentCommunicationMessage(
        messageRecord({
          status: CommunicationMessageStatus.HIDDEN,
          body: 'hidden secret',
          hiddenAt: new Date('2026-05-02T09:00:00.000Z'),
        }),
      ).content,
    ).toBeNull();
  });

  it('sanitizes sensitive metadata and supports list shape', () => {
    const record = messageRecord({
      metadata: {
        topic: 'math',
        schoolId: 'school-1',
        body: 'must not leak',
        nested: {
          text: 'must not leak nested',
          visible: true,
        },
      },
    });

    const list = presentCommunicationMessageList({
      conversationId: 'conversation-1',
      items: [record],
      total: 1,
      limit: 50,
      page: 1,
    });
    const json = JSON.stringify(list);

    expect(list.items[0].metadata).toEqual({
      topic: 'math',
      nested: { visible: true },
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('must not leak');
  });

  it('computes readCount from readers other than the sender', () => {
    const presented = presentCommunicationMessage(
      messageRecord({
        senderUserId: 'sender-1',
        reads: [
          { userId: 'sender-1' },
          { userId: 'reader-1' },
          { userId: 'reader-2' },
        ],
        _count: { reads: 3 },
      }),
    );

    expect(presented.readCount).toBe(2);
  });

  it('presents safe attachments and suppresses them for hidden messages', () => {
    const visible = presentCommunicationMessage(
      messageRecord({
        kind: CommunicationMessageKind.IMAGE,
        attachments: [attachmentRecord()] as any,
      }),
    );
    const hidden = presentCommunicationMessage(
      messageRecord({
        status: CommunicationMessageStatus.HIDDEN,
        hiddenAt: new Date('2026-05-02T09:00:00.000Z'),
        attachments: [attachmentRecord()] as any,
      }),
    );
    const json = JSON.stringify(visible);

    expect(visible.attachments).toEqual([
      expect.objectContaining({
        attachmentId: 'attachment-1',
        fileId: 'file-1',
        displayName: 'photo.jpg',
        mimeType: 'image/jpeg',
        mediaKind: 'image',
        downloadPath: '/api/v1/files/file-1/download',
      }),
    ]);
    expect(visible.attachmentsCount).toBe(1);
    expect(hidden.attachments).toEqual([]);
    expect(hidden.attachmentsCount).toBe(0);
    expect(json).not.toContain('bucket');
    expect(json).not.toContain('objectKey');
    expect(json).not.toContain('signedUrl');
  });

  it('summarizes audits without storing full message body', () => {
    const summary = summarizeCommunicationMessageForAudit(
      messageRecord({ body: 'Sensitive chat body' }),
    );

    expect(summary).toMatchObject({
      id: 'message-1',
      bodyLength: 19,
      hasBody: true,
    });
    expect(JSON.stringify(summary)).not.toContain('Sensitive chat body');
  });
});

function messageRecord(
  overrides?: Partial<CommunicationMessageRecord>,
): CommunicationMessageRecord {
  return {
    id: 'message-1',
    schoolId: 'school-1',
    conversationId: 'conversation-1',
    senderUserId: 'actor-1',
    kind: CommunicationMessageKind.TEXT,
    status: CommunicationMessageStatus.SENT,
    body: 'Hello',
    clientMessageId: 'client-1',
    replyToMessageId: null,
    editedAt: null,
    hiddenById: null,
    hiddenAt: null,
    hiddenReason: null,
    deletedById: null,
    deletedAt: null,
    sentAt: new Date('2026-05-02T08:00:00.000Z'),
    metadata: null,
    createdAt: new Date('2026-05-02T08:00:00.000Z'),
    updatedAt: new Date('2026-05-02T08:30:00.000Z'),
    _count: { reads: 0 },
    reads: [],
    attachments: [],
    ...(overrides ?? {}),
  };
}

function attachmentRecord() {
  return {
    id: 'attachment-1',
    fileId: 'file-1',
    caption: null,
    sortOrder: 0,
    createdAt: new Date('2026-05-02T08:00:00.000Z'),
    file: {
      id: 'file-1',
      originalName: 'photo.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 123n,
      visibility: 'PRIVATE',
      createdAt: new Date('2026-05-02T07:59:00.000Z'),
    },
  };
}
