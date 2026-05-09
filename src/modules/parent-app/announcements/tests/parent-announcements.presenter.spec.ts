import { ParentAnnouncementsPresenter } from '../presenters/parent-announcements.presenter';
import type {
  ParentAnnouncementAttachmentRecord,
  ParentAnnouncementReadModel,
} from '../infrastructure/parent-announcements-read.adapter';

describe('ParentAnnouncementsPresenter', () => {
  it('presents announcement reads without audience internals or tenant fields', () => {
    const response = ParentAnnouncementsPresenter.presentAnnouncement({
      announcement: announcementFixture(),
      readAt: null,
    });
    const serialized = JSON.stringify(response);

    expect(response.announcement).toMatchObject({
      announcementId: 'announcement-1',
      title: 'Parent visible',
      isNew: true,
      attachmentsCount: 1,
    });
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'audiences',
      'userId',
      'guardianId',
      'studentId',
      'bucket',
      'objectKey',
      'storageKey',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('presents only safe attachment metadata', () => {
    const response = ParentAnnouncementsPresenter.presentAttachments({
      announcementId: 'announcement-1',
      attachments: [attachmentFixture()],
    });

    expect(response.attachments).toEqual([
      {
        fileId: 'file-1',
        filename: 'notice.pdf',
        mimeType: 'application/pdf',
        size: '2048',
      },
    ]);
    expect(JSON.stringify(response)).not.toContain('objectKey');
  });
});

function announcementFixture(): ParentAnnouncementReadModel['announcement'] {
  return {
    id: 'announcement-1',
    title: 'Parent visible',
    body: 'Visible body',
    status: 'PUBLISHED',
    priority: 'NORMAL',
    audienceType: 'SCHOOL',
    category: 'general',
    isPinned: false,
    pinnedUntil: null,
    actionLabel: null,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    imageFile: null,
    createdBy: {
      id: 'user-1',
      firstName: 'Admin',
      lastName: 'User',
      userType: 'SCHOOL_USER',
    },
    publishedBy: null,
    _count: { attachments: 1 },
  } as unknown as ParentAnnouncementReadModel['announcement'];
}

function attachmentFixture(): ParentAnnouncementAttachmentRecord {
  return {
    id: 'attachment-1',
    fileId: 'file-1',
    sortOrder: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    file: {
      id: 'file-1',
      originalName: 'notice.pdf',
      mimeType: 'application/pdf',
      sizeBytes: BigInt(2048),
    },
  } as unknown as ParentAnnouncementAttachmentRecord;
}
