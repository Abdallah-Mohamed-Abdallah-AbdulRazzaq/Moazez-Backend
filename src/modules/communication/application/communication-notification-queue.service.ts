import { Injectable } from '@nestjs/common';
import { BullmqService } from '../../../infrastructure/queue/bullmq.service';
import {
  buildAnnouncementNotificationGenerationJobId,
  COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_GENERATE_JOB_NAME,
  CommunicationAnnouncementNotificationGenerationJobData,
  COMMUNICATION_NOTIFICATION_QUEUE_NAME,
  buildAcademicContentNotificationGenerationJobId,
  COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATIONS_GENERATE_JOB_NAME,
  CommunicationAcademicContentNotificationGenerationJobData,
  isAcademicContentNotificationGenerationJobData,
} from '../domain/communication-notification-generation-domain';

@Injectable()
export class CommunicationNotificationQueueService {
  constructor(private readonly bullmqService: BullmqService) {}

  ensureAcademicContentPublishedNotifications(
    data: CommunicationAcademicContentNotificationGenerationJobData,
  ) {
    if (!isAcademicContentNotificationGenerationJobData(data))
      throw new Error('academic_content_notification_job_invalid');
    return this.bullmqService.ensureJobFromPersistedTruth(
      COMMUNICATION_NOTIFICATION_QUEUE_NAME,
      COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATIONS_GENERATE_JOB_NAME,
      data,
      {
        jobId: buildAcademicContentNotificationGenerationJobId(data),
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }

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
