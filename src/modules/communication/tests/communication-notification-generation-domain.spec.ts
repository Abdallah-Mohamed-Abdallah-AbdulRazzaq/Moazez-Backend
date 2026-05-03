import {
  CommunicationAnnouncementAudienceType,
  CommunicationAnnouncementPriority,
  CommunicationNotificationPriority,
} from '@prisma/client';
import {
  buildAnnouncementNotificationGenerationJobId,
  buildAnnouncementNotificationMetadata,
  buildAnnouncementNotificationPreview,
  deduplicateRecipientUserIds,
  mapAnnouncementPriorityToNotificationPriority,
} from '../domain/communication-notification-generation-domain';

describe('communication notification generation domain', () => {
  it('builds deterministic announcement generation job ids', () => {
    expect(
      buildAnnouncementNotificationGenerationJobId({
        schoolId: 'school-1',
        announcementId: 'announcement-1',
      }),
    ).toBe('communication-announcement-notifications:school-1:announcement-1');
  });

  it('maps announcement priority to notification priority', () => {
    expect(
      mapAnnouncementPriorityToNotificationPriority(
        CommunicationAnnouncementPriority.LOW,
      ),
    ).toBe(CommunicationNotificationPriority.LOW);
    expect(
      mapAnnouncementPriorityToNotificationPriority(
        CommunicationAnnouncementPriority.URGENT,
      ),
    ).toBe(CommunicationNotificationPriority.URGENT);
  });

  it('compacts announcement bodies into safe notification previews', () => {
    expect(buildAnnouncementNotificationPreview(' First\n\n body\tline ')).toBe(
      'First body line',
    );
    expect(buildAnnouncementNotificationPreview('x'.repeat(300))).toHaveLength(
      240,
    );
    expect(buildAnnouncementNotificationPreview('x'.repeat(300))).toMatch(
      /\.\.\.$/,
    );
  });

  it('deduplicates recipient ids and omits blanks', () => {
    expect(
      deduplicateRecipientUserIds(['user-1', '', 'user-2', 'user-1', '   ']),
    ).toEqual(['user-1', 'user-2']);
  });

  it('builds compact metadata without school identifiers', () => {
    const metadata = buildAnnouncementNotificationMetadata({
      announcementId: 'announcement-1',
      audienceType: CommunicationAnnouncementAudienceType.CLASSROOM,
      publishedAt: new Date('2026-05-03T09:00:00.000Z'),
    });
    const json = JSON.stringify(metadata);

    expect(metadata).toEqual({
      announcementId: 'announcement-1',
      audienceType: 'CLASSROOM',
      publishedAt: '2026-05-03T09:00:00.000Z',
    });
    expect(json).not.toContain('schoolId');
  });
});
