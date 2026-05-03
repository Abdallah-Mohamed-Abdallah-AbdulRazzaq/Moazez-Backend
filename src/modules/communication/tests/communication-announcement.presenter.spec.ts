import {
  CommunicationAnnouncementAudienceType,
  CommunicationAnnouncementPriority,
  CommunicationAnnouncementStatus,
} from '@prisma/client';
import { CommunicationAnnouncementDetailRecord } from '../infrastructure/communication-announcement.repository';
import {
  presentCommunicationAnnouncement,
  presentCommunicationAnnouncementList,
  summarizeCommunicationAnnouncementForAudit,
} from '../presenters/communication-announcement.presenter';

describe('communication announcement presenter', () => {
  it('maps enum values to lowercase and never exposes schoolId', () => {
    const presented = presentCommunicationAnnouncement(
      announcementRecord({
        status: CommunicationAnnouncementStatus.PUBLISHED,
        priority: CommunicationAnnouncementPriority.HIGH,
        audienceType: CommunicationAnnouncementAudienceType.GRADE,
      }),
    );
    const json = JSON.stringify(presented);

    expect(presented.status).toBe('published');
    expect(presented.priority).toBe('high');
    expect(presented.audienceType).toBe('grade');
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('school-1');
  });

  it('omits full body from list responses', () => {
    const list = presentCommunicationAnnouncementList({
      items: [announcementRecord({ body: 'Sensitive full body' })],
      total: 1,
      limit: 50,
      page: 1,
    });
    const json = JSON.stringify(list);

    expect(list.items[0]).toMatchObject({
      id: 'announcement-1',
      title: 'Announcement title',
    });
    expect(json).not.toContain('Sensitive full body');
    expect(json).not.toContain('"body"');
  });

  it('sanitizes metadata and summarizes audits without full body content', () => {
    const record = announcementRecord({
      body: 'Sensitive announcement body',
      metadata: {
        source: 'unit',
        schoolId: 'school-1',
        notification: { channel: 'push' },
        nested: { body: 'nested body', visible: true },
      },
    });

    const presented = presentCommunicationAnnouncement(record);
    const summary = summarizeCommunicationAnnouncementForAudit(record);
    const json = JSON.stringify(presented);

    expect(presented.metadata).toEqual({
      source: 'unit',
      nested: { visible: true },
    });
    expect(summary).toMatchObject({
      id: 'announcement-1',
      bodyLength: 27,
      hasBody: true,
    });
    expect(JSON.stringify(summary)).not.toContain(
      'Sensitive announcement body',
    );
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('push');
    expect(json).not.toContain('nested body');
  });
});

function announcementRecord(
  overrides?: Partial<CommunicationAnnouncementDetailRecord>,
): CommunicationAnnouncementDetailRecord {
  return {
    id: 'announcement-1',
    schoolId: 'school-1',
    title: 'Announcement title',
    body: 'Announcement body',
    status: CommunicationAnnouncementStatus.DRAFT,
    priority: CommunicationAnnouncementPriority.NORMAL,
    audienceType: CommunicationAnnouncementAudienceType.SCHOOL,
    scheduledAt: null,
    publishedAt: null,
    archivedAt: null,
    expiresAt: null,
    createdById: 'actor-1',
    updatedById: 'actor-1',
    publishedById: null,
    archivedById: null,
    metadata: null,
    createdAt: new Date('2026-05-03T08:00:00.000Z'),
    updatedAt: new Date('2026-05-03T08:30:00.000Z'),
    audiences: [],
    attachments: [],
    _count: { attachments: 0, reads: 0 },
    ...(overrides ?? {}),
  };
}
