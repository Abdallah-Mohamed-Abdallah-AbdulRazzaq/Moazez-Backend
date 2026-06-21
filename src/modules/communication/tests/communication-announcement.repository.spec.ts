import {
  CommunicationAnnouncementAudienceType,
  CommunicationAnnouncementPriority,
  CommunicationAnnouncementStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  CommunicationAnnouncementListRecord,
  CommunicationAnnouncementRepository,
} from '../infrastructure/communication-announcement.repository';

describe('CommunicationAnnouncementRepository', () => {
  it('finds due scheduled announcements with bounded stable ordering', async () => {
    const dueAnnouncement = announcementListRecord();
    const scoped = {
      communicationAnnouncement: {
        findMany: jest.fn().mockResolvedValue([dueAnnouncement]),
      },
    };
    const repository = new CommunicationAnnouncementRepository({
      scoped,
    } as unknown as PrismaService);
    const now = new Date('2026-05-03T10:00:00.000Z');

    const result =
      await repository.findDueScheduledCurrentSchoolAnnouncements({
        now,
        limit: 25,
      });

    expect(result).toEqual([dueAnnouncement]);
    expect(scoped.communicationAnnouncement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: CommunicationAnnouncementStatus.SCHEDULED,
          scheduledAt: { lte: now },
          publishedAt: null,
          archivedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: [
          { scheduledAt: 'asc' },
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
        take: 25,
        select: expect.objectContaining({
          id: true,
          schoolId: true,
          scheduledAt: true,
          publishedAt: true,
          archivedAt: true,
        }),
      }),
    );
  });
});

function announcementListRecord(): CommunicationAnnouncementListRecord {
  return {
    id: 'announcement-1',
    schoolId: 'school-1',
    title: 'Scheduled announcement',
    status: CommunicationAnnouncementStatus.SCHEDULED,
    priority: CommunicationAnnouncementPriority.NORMAL,
    audienceType: CommunicationAnnouncementAudienceType.SCHOOL,
    scheduledAt: new Date('2026-05-03T09:00:00.000Z'),
    publishedAt: null,
    archivedAt: null,
    expiresAt: null,
    createdById: 'actor-1',
    updatedById: 'actor-1',
    publishedById: null,
    archivedById: null,
    createdAt: new Date('2026-05-03T08:00:00.000Z'),
    updatedAt: new Date('2026-05-03T08:00:00.000Z'),
    audiences: [],
    _count: { attachments: 0, reads: 0 },
  };
}
