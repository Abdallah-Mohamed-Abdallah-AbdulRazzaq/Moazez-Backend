import { UserType } from '@prisma/client';
import { BullmqService } from '../../../infrastructure/queue/bullmq.service';
import { CommunicationNotificationQueueService } from '../application/communication-notification-queue.service';
import {
  COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_GENERATE_JOB_NAME,
  COMMUNICATION_NOTIFICATION_QUEUE_NAME,
} from '../domain/communication-notification-generation-domain';

describe('CommunicationNotificationQueueService', () => {
  it('enqueues announcement notification generation as a retryable school-scoped job', async () => {
    const bullmqService = {
      addJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
    } as unknown as jest.Mocked<Pick<BullmqService, 'addJob'>>;
    const service = new CommunicationNotificationQueueService(
      bullmqService as unknown as BullmqService,
    );

    await service.enqueueAnnouncementPublishedNotifications({
      schoolId: 'school-1',
      organizationId: 'org-1',
      announcementId: 'announcement-1',
      actorUserId: 'actor-1',
      actorUserType: UserType.SCHOOL_USER,
    });

    expect(bullmqService.addJob).toHaveBeenCalledWith(
      COMMUNICATION_NOTIFICATION_QUEUE_NAME,
      COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_GENERATE_JOB_NAME,
      {
        schoolId: 'school-1',
        organizationId: 'org-1',
        announcementId: 'announcement-1',
        actorUserId: 'actor-1',
        actorUserType: UserType.SCHOOL_USER,
      },
      expect.objectContaining({
        jobId:
          'communication-announcement-notifications:school-1:announcement-1',
        attempts: 3,
      }),
    );
  });
});
