import { FileVisibility } from '@prisma/client';
import { CommunicationAnnouncementAttachmentRecord } from '../infrastructure/communication-announcement.repository';
import {
  presentCommunicationAnnouncementAttachment,
  presentCommunicationAnnouncementAttachmentList,
  summarizeCommunicationAnnouncementAttachmentForAudit,
} from '../presenters/communication-announcement-attachment.presenter';

describe('communication announcement attachment presenter', () => {
  it('presents safe file metadata without schoolId', () => {
    const presented =
      presentCommunicationAnnouncementAttachment(attachmentRecord());
    const json = JSON.stringify(presented);

    expect(presented).toMatchObject({
      id: 'attachment-1',
      announcementId: 'announcement-1',
      fileId: 'file-1',
      file: {
        id: 'file-1',
        filename: 'announcement.pdf',
        mimeType: 'application/pdf',
        sizeBytes: '2048',
      },
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('school-1');
  });

  it('supports list and audit summaries without exposing school scope', () => {
    const attachment = attachmentRecord({ caption: 'Family guide' });
    const list = presentCommunicationAnnouncementAttachmentList({
      announcementId: 'announcement-1',
      items: [attachment],
    });
    const summary =
      summarizeCommunicationAnnouncementAttachmentForAudit(attachment);
    const json = JSON.stringify({ list, summary });

    expect(list.items).toHaveLength(1);
    expect(summary).toMatchObject({
      id: 'attachment-1',
      fileId: 'file-1',
      captionLength: 12,
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('school-1');
  });
});

function attachmentRecord(
  overrides?: Partial<CommunicationAnnouncementAttachmentRecord>,
): CommunicationAnnouncementAttachmentRecord {
  return {
    id: 'attachment-1',
    schoolId: 'school-1',
    announcementId: 'announcement-1',
    fileId: 'file-1',
    createdById: 'actor-1',
    caption: null,
    sortOrder: 0,
    createdAt: new Date('2026-05-03T08:00:00.000Z'),
    updatedAt: new Date('2026-05-03T08:30:00.000Z'),
    file: {
      id: 'file-1',
      schoolId: 'school-1',
      originalName: 'announcement.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048n,
      visibility: FileVisibility.PRIVATE,
      deletedAt: null,
    },
    ...(overrides ?? {}),
  };
}
