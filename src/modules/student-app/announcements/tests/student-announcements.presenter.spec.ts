import {
  CommunicationAnnouncementAudienceType,
  CommunicationAnnouncementPriority,
  CommunicationAnnouncementStatus,
  UserType,
} from '@prisma/client';
import { StudentAnnouncementsPresenter } from '../presenters/student-announcements.presenter';

describe('StudentAnnouncementsPresenter', () => {
  it('presents announcement details without audience internals or storage fields', () => {
    const result = StudentAnnouncementsPresenter.presentAnnouncement(
      announcementReadFixture() as any,
    );
    const serialized = JSON.stringify(result);

    expect(result.announcement).toMatchObject({
      announcementId: 'announcement-1',
      title: 'Exam update',
      isNew: true,
      image: null,
      attachmentsCount: 1,
    });
    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('scheduleId');
    expect(serialized).not.toContain('audiences');
    expect(serialized).not.toContain('bucket');
    expect(serialized).not.toContain('objectKey');
  });

  it('presents attachments as safe file metadata only', () => {
    const result = StudentAnnouncementsPresenter.presentAttachments({
      announcementId: 'announcement-1',
      attachments: [
        {
          id: 'attachment-1',
          fileId: 'file-1',
          sortOrder: 0,
          createdAt: new Date('2026-01-01T08:00:00.000Z'),
          file: {
            id: 'file-1',
            originalName: 'notice.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 123n,
          },
        } as any,
      ],
    });
    const serialized = JSON.stringify(result);

    expect(result.attachments).toEqual([
      {
        fileId: 'file-1',
        filename: 'notice.pdf',
        mimeType: 'application/pdf',
        size: '123',
      },
    ]);
    expect(serialized).not.toContain('bucket');
    expect(serialized).not.toContain('objectKey');
    expect(serialized).not.toContain('downloadUrl');
    expect(serialized).not.toContain('schoolId');
  });
});

function announcementReadFixture() {
  return {
    announcement: {
      id: 'announcement-1',
      title: 'Exam update',
      body: 'Body',
      status: CommunicationAnnouncementStatus.PUBLISHED,
      priority: CommunicationAnnouncementPriority.NORMAL,
      audienceType: CommunicationAnnouncementAudienceType.SCHOOL,
      category: 'school',
      isPinned: true,
      pinnedUntil: null,
      actionLabel: null,
      publishedAt: new Date('2026-01-01T08:00:00.000Z'),
      expiresAt: null,
      createdAt: new Date('2026-01-01T08:00:00.000Z'),
      updatedAt: new Date('2026-01-01T08:00:00.000Z'),
      imageFile: {
        id: 'file-image',
        originalName: 'image.png',
        mimeType: 'image/png',
        sizeBytes: 100n,
      },
      createdBy: {
        id: 'teacher-user-1',
        firstName: 'Teacher',
        lastName: 'User',
        userType: UserType.TEACHER,
      },
      publishedBy: null,
      _count: { attachments: 1 },
    },
    readAt: null,
  };
}
