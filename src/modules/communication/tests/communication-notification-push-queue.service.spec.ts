import { UserType } from '@prisma/client';
import { BullmqService } from '../../../infrastructure/queue/bullmq.service';
import { CommunicationNotificationPushQueueService } from '../application/communication-notification-push-queue.service';
import {
  COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME,
  COMMUNICATION_NOTIFICATION_PUSH_SEND_JOB_NAME,
} from '../domain/communication-notification-generation-domain';

describe('CommunicationNotificationPushQueueService', () => {
  it('enqueues bounded push delivery jobs without token material', async () => {
    const bullmqService = {
      addJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
    } as unknown as BullmqService & Record<string, jest.Mock>;
    const service = new CommunicationNotificationPushQueueService(
      bullmqService,
    );

    await service.enqueueNotificationPushDelivery({
      schoolId: 'school-1',
      organizationId: 'org-1',
      notificationId: 'notification-1',
      deliveryId: 'delivery-1',
      actorUserId: 'actor-1',
      actorUserType: UserType.SCHOOL_USER,
    });

    expect(bullmqService.addJob).toHaveBeenCalledWith(
      COMMUNICATION_NOTIFICATION_PUSH_QUEUE_NAME,
      COMMUNICATION_NOTIFICATION_PUSH_SEND_JOB_NAME,
      {
        schoolId: 'school-1',
        organizationId: 'org-1',
        notificationId: 'notification-1',
        deliveryId: 'delivery-1',
        actorUserId: 'actor-1',
        actorUserType: UserType.SCHOOL_USER,
      },
      expect.objectContaining({
        jobId: 'communication-push-delivery-1',
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      }),
    );
    expect(bullmqService.addJob.mock.calls[0][3].jobId).not.toContain(':');
    expect(JSON.stringify(bullmqService.addJob.mock.calls)).not.toContain(
      'tokenCiphertext',
    );
    expect(JSON.stringify(bullmqService.addJob.mock.calls)).not.toContain(
      'tokenHash',
    );
  });
});
