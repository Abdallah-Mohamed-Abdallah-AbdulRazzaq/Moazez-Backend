import {
  assertAnnouncementAudienceIsValid,
  assertAnnouncementLifecycleDates,
  assertCanMarkAnnouncementRead,
  assertCanUpdateAnnouncement,
  CommunicationAnnouncementInvalidException,
  CommunicationAnnouncementStateException,
  normalizeCommunicationAnnouncementAudienceType,
  normalizeCommunicationAnnouncementPriority,
  normalizeCommunicationAnnouncementStatus,
} from '../domain/communication-announcement-domain';

describe('communication announcement domain', () => {
  it('normalizes public enum values to Prisma-style values', () => {
    expect(normalizeCommunicationAnnouncementStatus('published')).toBe(
      'PUBLISHED',
    );
    expect(normalizeCommunicationAnnouncementPriority('urgent')).toBe('URGENT');
    expect(normalizeCommunicationAnnouncementAudienceType('classroom')).toBe(
      'CLASSROOM',
    );
  });

  it('validates audience rows conservatively', () => {
    expect(() =>
      assertAnnouncementAudienceIsValid({
        audienceType: 'SCHOOL',
        audienceRows: [],
      }),
    ).not.toThrow();

    expect(() =>
      assertAnnouncementAudienceIsValid({
        audienceType: 'SCHOOL',
        audienceRows: [{ gradeId: 'grade-1' }],
      }),
    ).toThrow(CommunicationAnnouncementInvalidException);

    expect(() =>
      assertAnnouncementAudienceIsValid({
        audienceType: 'GRADE',
        audienceRows: [{ gradeId: 'grade-1' }],
      }),
    ).not.toThrow();

    expect(() =>
      assertAnnouncementAudienceIsValid({
        audienceType: 'GRADE',
        audienceRows: [{ sectionId: 'section-1' }],
      }),
    ).toThrow(CommunicationAnnouncementInvalidException);
  });

  it('validates lifecycle dates for scheduled and expiring announcements', () => {
    const now = new Date('2026-05-03T10:00:00.000Z');

    expect(() =>
      assertAnnouncementLifecycleDates(
        {
          status: 'SCHEDULED',
          scheduledAt: new Date('2026-05-04T10:00:00.000Z'),
          expiresAt: new Date('2026-05-05T10:00:00.000Z'),
        },
        now,
      ),
    ).not.toThrow();

    expect(() =>
      assertAnnouncementLifecycleDates(
        {
          status: 'SCHEDULED',
          scheduledAt: new Date('2026-05-02T10:00:00.000Z'),
        },
        now,
      ),
    ).toThrow(CommunicationAnnouncementInvalidException);

    expect(() =>
      assertAnnouncementLifecycleDates(
        {
          status: 'DRAFT',
          expiresAt: new Date('2026-05-02T10:00:00.000Z'),
        },
        now,
      ),
    ).toThrow(CommunicationAnnouncementInvalidException);
  });

  it('rejects updates to published archived and cancelled announcements', () => {
    for (const status of ['PUBLISHED', 'ARCHIVED', 'CANCELLED'] as const) {
      expect(() =>
        assertCanUpdateAnnouncement({
          announcement: {
            id: `announcement-${status}`,
            status,
            title: 'Title',
            body: 'Body',
            audienceType: 'SCHOOL',
          },
          title: 'Updated',
          body: 'Body',
          audienceType: 'SCHOOL',
          audienceRows: [],
        }),
      ).toThrow(CommunicationAnnouncementStateException);
    }
  });

  it('allows read receipts only for non-expired published announcements', () => {
    const now = new Date('2026-05-03T10:00:00.000Z');

    expect(() =>
      assertCanMarkAnnouncementRead(
        {
          id: 'announcement-1',
          status: 'PUBLISHED',
          title: 'Title',
          body: 'Body',
          audienceType: 'SCHOOL',
          expiresAt: new Date('2026-05-04T10:00:00.000Z'),
        },
        now,
      ),
    ).not.toThrow();

    expect(() =>
      assertCanMarkAnnouncementRead(
        {
          id: 'announcement-2',
          status: 'ARCHIVED',
          title: 'Title',
          body: 'Body',
          audienceType: 'SCHOOL',
        },
        now,
      ),
    ).toThrow(CommunicationAnnouncementStateException);

    expect(() =>
      assertCanMarkAnnouncementRead(
        {
          id: 'announcement-3',
          status: 'PUBLISHED',
          title: 'Title',
          body: 'Body',
          audienceType: 'SCHOOL',
          expiresAt: new Date('2026-05-02T10:00:00.000Z'),
        },
        now,
      ),
    ).toThrow(CommunicationAnnouncementStateException);
  });
});
