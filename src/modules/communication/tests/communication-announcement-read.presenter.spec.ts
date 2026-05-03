import { CommunicationAnnouncementReadRecord } from '../infrastructure/communication-announcement.repository';
import {
  presentCommunicationAnnouncementReadReceipt,
  presentCommunicationAnnouncementReadSummary,
} from '../presenters/communication-announcement-read.presenter';

describe('communication announcement read presenter', () => {
  it('returns compact read receipts without schoolId', () => {
    const presented = presentCommunicationAnnouncementReadReceipt(readRecord());
    const json = JSON.stringify(presented);

    expect(presented).toEqual({
      announcementId: 'announcement-1',
      userId: 'actor-1',
      readAt: '2026-05-03T09:00:00.000Z',
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('school-1');
  });

  it('returns compact read summary without user details', () => {
    const presented = presentCommunicationAnnouncementReadSummary({
      announcementId: 'announcement-1',
      readCount: 3,
      totalTargetCount: null,
      totalTargetCountReason:
        'audience_target_count_deferred_until_app_audience_resolution',
    });
    const json = JSON.stringify(presented);

    expect(presented).toEqual({
      announcementId: 'announcement-1',
      readCount: 3,
      totalTargetCount: null,
      totalTargetCountReason:
        'audience_target_count_deferred_until_app_audience_resolution',
    });
    expect(json).not.toContain('schoolId');
    expect(json).not.toContain('firstName');
    expect(json).not.toContain('lastName');
  });
});

function readRecord(
  overrides?: Partial<CommunicationAnnouncementReadRecord>,
): CommunicationAnnouncementReadRecord {
  return {
    id: 'read-1',
    schoolId: 'school-1',
    announcementId: 'announcement-1',
    userId: 'actor-1',
    readAt: new Date('2026-05-03T09:00:00.000Z'),
    createdAt: new Date('2026-05-03T09:00:00.000Z'),
    updatedAt: new Date('2026-05-03T09:00:00.000Z'),
    ...(overrides ?? {}),
  };
}
