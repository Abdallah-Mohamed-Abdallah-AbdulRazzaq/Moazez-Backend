import {
  CommunicationAnnouncementAudienceType,
  CommunicationAnnouncementPriority,
  CommunicationAnnouncementStatus,
  CommunicationNotificationPriority,
  UserType,
} from '@prisma/client';
import { CommunicationNotificationGenerationService } from '../application/communication-notification-generation.service';
import {
  CommunicationAnnouncementForNotificationGeneration,
  CommunicationNotificationGenerationRepository,
} from '../infrastructure/communication-notification-generation.repository';

const SCHOOL_ID = 'school-1';
const ORGANIZATION_ID = 'org-1';
const ANNOUNCEMENT_ID = 'announcement-1';
const ACTOR_ID = 'actor-1';

describe('CommunicationNotificationGenerationService', () => {
  it('generates announcement notifications for resolved recipients with safe content', async () => {
    const repository = repositoryMock({
      resolveCurrentSchoolAnnouncementRecipientUserIds: jest
        .fn()
        .mockResolvedValue(['user-1', 'user-2', 'user-1']),
      createMissingAnnouncementPublishedNotifications: jest
        .fn()
        .mockResolvedValue({
          recipientCount: 2,
          createdNotificationCount: 2,
          existingNotificationCount: 0,
          createdDeliveryCount: 2,
          existingDeliveryCount: 0,
        }),
    });

    const result = await new CommunicationNotificationGenerationService(
      repository,
    ).generateForPublishedAnnouncement(jobData());

    expect(result).toMatchObject({
      announcementId: ANNOUNCEMENT_ID,
      recipientCount: 2,
      createdNotificationCount: 2,
      createdDeliveryCount: 2,
      skippedReason: null,
    });
    expect(
      repository.createMissingAnnouncementPublishedNotifications,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: SCHOOL_ID,
        announcementId: ANNOUNCEMENT_ID,
        recipientUserIds: ['user-1', 'user-2'],
        actorUserId: ACTOR_ID,
        title: 'Published announcement',
        body: 'Body with spacing',
        priority: CommunicationNotificationPriority.HIGH,
        metadata: expect.not.objectContaining({ schoolId: expect.anything() }),
        now: expect.any(Date),
      }),
    );
  });

  it('skips missing or unpublished announcements', async () => {
    const repository = repositoryMock({
      findPublishedCurrentSchoolAnnouncementForNotificationGeneration: jest
        .fn()
        .mockResolvedValue(null),
    });

    const result = await new CommunicationNotificationGenerationService(
      repository,
    ).generateForPublishedAnnouncement(jobData());

    expect(result).toMatchObject({
      announcementId: ANNOUNCEMENT_ID,
      skippedReason: 'announcement_not_published_or_not_found',
    });
    expect(
      repository.resolveCurrentSchoolAnnouncementRecipientUserIds,
    ).not.toHaveBeenCalled();
    expect(
      repository.createMissingAnnouncementPublishedNotifications,
    ).not.toHaveBeenCalled();
  });

  it('skips published announcements with no safely resolved recipients', async () => {
    const repository = repositoryMock({
      resolveCurrentSchoolAnnouncementRecipientUserIds: jest
        .fn()
        .mockResolvedValue([]),
    });

    const result = await new CommunicationNotificationGenerationService(
      repository,
    ).generateForPublishedAnnouncement(jobData());

    expect(result).toMatchObject({
      announcementId: ANNOUNCEMENT_ID,
      recipientCount: 0,
      skippedReason: 'no_resolved_recipients',
    });
    expect(
      repository.createMissingAnnouncementPublishedNotifications,
    ).not.toHaveBeenCalled();
  });

  it('returns existing counts on retry without treating them as new notifications', async () => {
    const repository = repositoryMock({
      createMissingAnnouncementPublishedNotifications: jest
        .fn()
        .mockResolvedValue({
          recipientCount: 2,
          createdNotificationCount: 0,
          existingNotificationCount: 2,
          createdDeliveryCount: 0,
          existingDeliveryCount: 2,
        }),
    });

    const result = await new CommunicationNotificationGenerationService(
      repository,
    ).generateForPublishedAnnouncement(jobData());

    expect(result).toMatchObject({
      createdNotificationCount: 0,
      existingNotificationCount: 2,
      createdDeliveryCount: 0,
      existingDeliveryCount: 2,
    });
  });
});

function repositoryMock(
  overrides?: Record<string, unknown>,
): CommunicationNotificationGenerationRepository & Record<string, jest.Mock> {
  return {
    findPublishedCurrentSchoolAnnouncementForNotificationGeneration: jest
      .fn()
      .mockResolvedValue(announcementRecord()),
    resolveCurrentSchoolAnnouncementRecipientUserIds: jest
      .fn()
      .mockResolvedValue(['user-1', 'user-2']),
    createMissingAnnouncementPublishedNotifications: jest
      .fn()
      .mockResolvedValue({
        recipientCount: 2,
        createdNotificationCount: 2,
        existingNotificationCount: 0,
        createdDeliveryCount: 2,
        existingDeliveryCount: 0,
      }),
    ...(overrides ?? {}),
  } as unknown as CommunicationNotificationGenerationRepository &
    Record<string, jest.Mock>;
}

function announcementRecord(): CommunicationAnnouncementForNotificationGeneration {
  return {
    id: ANNOUNCEMENT_ID,
    schoolId: SCHOOL_ID,
    title: 'Published announcement',
    body: ' Body\nwith   spacing ',
    status: CommunicationAnnouncementStatus.PUBLISHED,
    priority: CommunicationAnnouncementPriority.HIGH,
    audienceType: CommunicationAnnouncementAudienceType.SCHOOL,
    publishedAt: new Date('2026-05-03T09:00:00.000Z'),
    expiresAt: null,
    createdById: 'creator-1',
    publishedById: ACTOR_ID,
    audiences: [],
  };
}

function jobData() {
  return {
    schoolId: SCHOOL_ID,
    organizationId: ORGANIZATION_ID,
    announcementId: ANNOUNCEMENT_ID,
    actorUserId: ACTOR_ID,
    actorUserType: UserType.SCHOOL_USER,
  };
}
