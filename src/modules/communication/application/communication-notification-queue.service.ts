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
  CommunicationAcademicContentSessionReminderJobData,
  isAcademicContentSessionReminderJobData,
  buildAcademicContentCancellationJobId,
  buildAcademicContentSessionReminderJobId,
  COMMUNICATION_ACADEMIC_CONTENT_CANCELLATION_GENERATE_JOB_NAME,
  COMMUNICATION_ACADEMIC_CONTENT_SESSION_REMINDER_GENERATE_JOB_NAME,
  CommunicationAcademicContentReviewDecisionJobData,
  isAcademicContentReviewDecisionJobData,
  buildAcademicContentReviewDecisionJobId,
  COMMUNICATION_ACADEMIC_CONTENT_REVIEW_DECISION_GENERATE_JOB_NAME,
} from '../domain/communication-notification-generation-domain';

@Injectable()
export class CommunicationNotificationQueueService {
  constructor(private readonly bullmqService: BullmqService) {}

  ensureAcademicContentReviewDecision(
    data: CommunicationAcademicContentReviewDecisionJobData,
  ) {
    if (!isAcademicContentReviewDecisionJobData(data))
      throw new Error('academic_content_review_decision_job_invalid');
    return this.bullmqService.ensureJobFromPersistedTruth(
      COMMUNICATION_NOTIFICATION_QUEUE_NAME,
      COMMUNICATION_ACADEMIC_CONTENT_REVIEW_DECISION_GENERATE_JOB_NAME,
      data,
      {
        jobId: buildAcademicContentReviewDecisionJobId(data),
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }

  ensureAcademicContentCancellationNotifications(
    data: CommunicationAcademicContentNotificationGenerationJobData,
  ) {
    if (!isAcademicContentNotificationGenerationJobData(data))
      throw new Error('academic_content_notification_job_invalid');
    return this.bullmqService.ensureJobFromPersistedTruth(
      COMMUNICATION_NOTIFICATION_QUEUE_NAME,
      COMMUNICATION_ACADEMIC_CONTENT_CANCELLATION_GENERATE_JOB_NAME,
      data,
      {
        jobId: buildAcademicContentCancellationJobId(data),
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }

  ensureAcademicContentSessionReminder(
    data: CommunicationAcademicContentSessionReminderJobData,
    reminderAt: Date,
    enqueueNow = new Date(),
  ) {
    if (
      !isAcademicContentSessionReminderJobData(data) ||
      !Number.isFinite(reminderAt.getTime()) ||
      !Number.isFinite(enqueueNow.getTime())
    )
      throw new Error('academic_content_session_reminder_job_invalid');
    return this.bullmqService.ensureJobFromPersistedTruth(
      COMMUNICATION_NOTIFICATION_QUEUE_NAME,
      COMMUNICATION_ACADEMIC_CONTENT_SESSION_REMINDER_GENERATE_JOB_NAME,
      data,
      {
        jobId: buildAcademicContentSessionReminderJobId(data),
        delay: Math.max(0, reminderAt.getTime() - enqueueNow.getTime()),
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }

  ensureAcademicContentPublishedNotifications(
    data: CommunicationAcademicContentNotificationGenerationJobData,
    dueAt = new Date(),
    enqueueNow = new Date(),
  ) {
    if (
      !isAcademicContentNotificationGenerationJobData(data) ||
      !Number.isFinite(dueAt.getTime()) ||
      !Number.isFinite(enqueueNow.getTime())
    )
      throw new Error('academic_content_notification_job_invalid');
    return this.bullmqService.ensureJobFromPersistedTruth(
      COMMUNICATION_NOTIFICATION_QUEUE_NAME,
      COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATIONS_GENERATE_JOB_NAME,
      data,
      {
        jobId: buildAcademicContentNotificationGenerationJobId(data),
        delay: Math.max(0, dueAt.getTime() - enqueueNow.getTime()),
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
