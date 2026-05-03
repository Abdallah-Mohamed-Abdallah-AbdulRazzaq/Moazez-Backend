import {
  CommunicationAnnouncementAudienceType,
  CommunicationAnnouncementPriority,
  CommunicationAnnouncementStatus,
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationDeliveryStatus,
  CommunicationNotificationPriority,
  CommunicationNotificationSourceModule,
  CommunicationNotificationStatus,
  CommunicationNotificationType,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  CommunicationAnnouncementForNotificationGeneration,
  CommunicationNotificationGenerationRepository,
} from '../infrastructure/communication-notification-generation.repository';

describe('CommunicationNotificationGenerationRepository', () => {
  it('resolves school audiences from active current-school memberships', async () => {
    const scoped = {
      membership: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { userId: 'user-1' },
            { userId: 'user-2' },
            { userId: 'user-1' },
          ]),
      },
    };
    const repository = new CommunicationNotificationGenerationRepository({
      scoped,
    } as unknown as PrismaService);

    const result =
      await repository.resolveCurrentSchoolAnnouncementRecipientUserIds(
        announcementRecord({
          audienceType: CommunicationAnnouncementAudienceType.SCHOOL,
        }),
      );

    expect(result).toEqual(['user-1', 'user-2']);
    expect(scoped.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
        }),
      }),
    );
  });

  it('resolves custom audience safe targets and filters them through active current-school memberships', async () => {
    const scoped = {
      studentGuardian: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ guardian: { userId: 'guardian-user-1' } }]),
      },
      guardian: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'guardian-user-1' }]),
      },
      membership: {
        findMany: jest.fn().mockResolvedValue([{ userId: 'guardian-user-1' }]),
      },
    };
    const repository = new CommunicationNotificationGenerationRepository({
      scoped,
    } as unknown as PrismaService);

    const result =
      await repository.resolveCurrentSchoolAnnouncementRecipientUserIds(
        announcementRecord({
          audienceType: CommunicationAnnouncementAudienceType.CUSTOM,
          audiences: [
            audienceRecord({ studentId: 'student-1' }),
            audienceRecord({ guardianId: 'guardian-1' }),
            audienceRecord({ userId: 'outside-or-inactive-user' }),
          ],
        }),
      );

    expect(result).toEqual(['guardian-user-1']);
    expect(scoped.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: {
            in: ['guardian-user-1', 'outside-or-inactive-user'],
          },
        }),
      }),
    );
  });

  it('creates only missing notification and IN_APP delivery rows on retry-safe generation', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      communicationNotification: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'existing-notification-1', recipientUserId: 'user-1' },
          ]),
        create: jest.fn().mockResolvedValue({ id: 'new-notification-1' }),
      },
      communicationNotificationDelivery: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ notificationId: 'existing-notification-1' }]),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const scoped = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const repository = new CommunicationNotificationGenerationRepository({
      scoped,
    } as unknown as PrismaService);

    const result =
      await repository.createMissingAnnouncementPublishedNotifications({
        schoolId: 'school-1',
        announcementId: 'announcement-1',
        recipientUserIds: ['user-1', 'user-2', 'user-2'],
        actorUserId: 'actor-1',
        title: 'Announcement',
        body: 'Preview',
        priority: CommunicationNotificationPriority.NORMAL,
        expiresAt: null,
        metadata: { announcementId: 'announcement-1' },
        now: new Date('2026-05-03T09:00:00.000Z'),
      });

    expect(result).toEqual({
      recipientCount: 2,
      createdNotificationCount: 1,
      existingNotificationCount: 1,
      createdDeliveryCount: 1,
      existingDeliveryCount: 1,
    });
    expect(tx.communicationNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientUserId: 'user-2',
          sourceModule: CommunicationNotificationSourceModule.ANNOUNCEMENTS,
          sourceType: 'communication_announcement',
          sourceId: 'announcement-1',
          type: CommunicationNotificationType.ANNOUNCEMENT_PUBLISHED,
          status: CommunicationNotificationStatus.UNREAD,
        }),
      }),
    );
    expect(
      tx.communicationNotificationDelivery.createMany,
    ).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          notificationId: 'new-notification-1',
          channel: CommunicationNotificationDeliveryChannel.IN_APP,
          status: CommunicationNotificationDeliveryStatus.DELIVERED,
          provider: 'in_app',
        }),
      ],
    });
  });
});

function announcementRecord(
  overrides?: Partial<CommunicationAnnouncementForNotificationGeneration>,
): CommunicationAnnouncementForNotificationGeneration {
  return {
    id: 'announcement-1',
    schoolId: 'school-1',
    title: 'Announcement',
    body: 'Body',
    status: CommunicationAnnouncementStatus.PUBLISHED,
    priority: CommunicationAnnouncementPriority.NORMAL,
    audienceType: CommunicationAnnouncementAudienceType.SCHOOL,
    publishedAt: new Date('2026-05-03T09:00:00.000Z'),
    expiresAt: null,
    createdById: 'creator-1',
    publishedById: 'actor-1',
    audiences: [],
    ...(overrides ?? {}),
  };
}

function audienceRecord(
  overrides?: Partial<
    CommunicationAnnouncementForNotificationGeneration['audiences'][number]
  >,
): CommunicationAnnouncementForNotificationGeneration['audiences'][number] {
  return {
    id: 'audience-1',
    audienceType: CommunicationAnnouncementAudienceType.CUSTOM,
    stageId: null,
    gradeId: null,
    sectionId: null,
    classroomId: null,
    studentId: null,
    guardianId: null,
    userId: null,
    ...(overrides ?? {}),
  };
}
