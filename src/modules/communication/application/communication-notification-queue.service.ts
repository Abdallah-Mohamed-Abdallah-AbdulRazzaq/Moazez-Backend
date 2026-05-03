import { Injectable } from '@nestjs/common';
import { BullmqService } from '../../../infrastructure/queue/bullmq.service';
import {
  buildAnnouncementNotificationGenerationJobId,
  COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_GENERATE_JOB_NAME,
  CommunicationAnnouncementNotificationGenerationJobData,
  COMMUNICATION_NOTIFICATION_QUEUE_NAME,
} from '../domain/communication-notification-generation-domain';

@Injectable()
export class CommunicationNotificationQueueService {
  constructor(private readonly bullmqService: BullmqService) {}

  enqueueAnnouncementPublishedNotifications(
    data: CommunicationAnnouncementNotificationGenerationJobData,
  ) {
    return this.bullmqService.addJob(
      COMMUNICATION_NOTIFICATION_QUEUE_NAME,
      COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_GENERATE_JOB_NAME,
      data,
      {
        jobId: buildAnnouncementNotificationGenerationJobId({
          schoolId: data.schoolId,
          announcementId: data.announcementId,
        }),
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }
}
