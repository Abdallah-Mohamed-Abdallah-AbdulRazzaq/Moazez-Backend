import { FileVisibility } from '@prisma/client';
import { CommunicationMessageAttachmentRecord } from '../infrastructure/communication-message-attachment.repository';
import {
  presentCommunicationMessageAttachment,
  presentCommunicationMessageAttachmentList,
  summarizeCommunicationMessageAttachmentForAudit,
} from '../presenters/communication-message-attachment.presenter';

describe('communication message attachment presenter', () => {
  it('presents safe file fields and never exposes schoolId or message body', () => {
    const presented = presentCommunicationMessageAttachment(attachmentRecord());
    const json = JSON.stringify(presented);

    expect(presented).toMatchObject({
      id: 'attachment-1',
      messageId: 'message-1',
      fileId: 'file-1',
      uploadedById: 'actor-1',
      file: {
        filename: 'worksheet.pdf',
        mimeType: 'application/pdf',
        sizeBytes: '1024',
      },
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('secret body');
    expect(json).not.toContain('school-1');
  });

  it('supports list shape and audit summaries without unsafe fields', () => {
    const list = presentCommunicationMessageAttachmentList({
      messageId: 'message-1',
      items: [attachmentRecord()],
    });
    const audit = summarizeCommunicationMessageAttachmentForAudit(
      attachmentRecord(),
    );
    const json = JSON.stringify({ list, audit });

    expect(list.items).toHaveLength(1);
    expect(audit).toMatchObject({
      id: 'attachment-1',
      messageId: 'message-1',
      fileId: 'file-1',
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('secret body');
  });
});

function attachmentRecord(
  overrides?: Partial<CommunicationMessageAttachmentRecord>,
): CommunicationMessageAttachmentRecord {
  return {
    id: 'attachment-1',
    schoolId: 'school-1',
    conversationId: 'conversation-1',
    messageId: 'message-1',
    fileId: 'file-1',
    uploadedById: 'actor-1',
    caption: null,
    sortOrder: 0,
    createdAt: new Date('2026-05-02T08:00:00.000Z'),
    updatedAt: new Date('2026-05-02T08:00:00.000Z'),
    deletedAt: null,
    file: {
      id: 'file-1',
      schoolId: 'school-1',
      originalName: 'worksheet.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024n,
      visibility: FileVisibility.PRIVATE,
      deletedAt: null,
    },
    ...(overrides ?? {}),
  };
}
