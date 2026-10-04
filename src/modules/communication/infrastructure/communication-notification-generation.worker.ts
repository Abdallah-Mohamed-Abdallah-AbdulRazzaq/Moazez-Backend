import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  createRequestContext,
  runWithRequestContext,
} from '../../../common/context/request-context';
import { BullmqService } from '../../../infrastructure/queue/bullmq.service';
import { CommunicationNotificationGenerationService } from '../application/communication-notification-generation.service';
import { CommunicationNotificationReconciliationService } from '../application/communication-notification-reconciliation.service';
import { AcademicContentPublicationNotificationService } from '../../academics/academic-content/application/academic-content-publication-notification.service';
import {
  COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_GENERATE_JOB_NAME,
  COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_RECONCILE_JOB_NAME,
  CommunicationAnnouncementNotificationGenerationJobData,
  COMMUNICATION_NOTIFICATION_QUEUE_NAME,
  COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATIONS_GENERATE_JOB_NAME,
  CommunicationAcademicContentNotificationGenerationJobData,
  isAcademicContentNotificationGenerationJobData,
  CommunicationAcademicContentSessionReminderJobData,
  isAcademicContentSessionReminderJobData,
  COMMUNICATION_ACADEMIC_CONTENT_CANCELLATION_GENERATE_JOB_NAME,
  COMMUNICATION_ACADEMIC_CONTENT_SESSION_REMINDER_GENERATE_JOB_NAME,
} from '../domain/communication-notification-generation-domain';

@Injectable()
export class CommunicationNotificationGenerationWorker implements OnModuleInit {
  constructor(
    private readonly bullmqService: BullmqService,
    private readonly generationService: CommunicationNotificationGenerationService,
    private readonly reconciliationService: CommunicationNotificationReconciliationService,
    private readonly academicContent: AcademicContentPublicationNotificationService,
  ) {}

  onModuleInit(): void {
    this.bullmqService.createWorker<
      | CommunicationAnnouncementNotificationGenerationJobData
      | CommunicationAcademicContentNotificationGenerationJobData
      | CommunicationAcademicContentSessionReminderJobData,
      void
    >(COMMUNICATION_NOTIFICATION_QUEUE_NAME, async (job) => {
      if (
        job.name === COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_RECONCILE_JOB_NAME
      ) {
        await this.reconciliationService.reconcile();
        return;
      }
      if (
        [
          COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATIONS_GENERATE_JOB_NAME,
          COMMUNICATION_ACADEMIC_CONTENT_CANCELLATION_GENERATE_JOB_NAME,
          COMMUNICATION_ACADEMIC_CONTENT_SESSION_REMINDER_GENERATE_JOB_NAME,
        ].includes(job.name)
      ) {
        const reminder =
          job.name ===
          COMMUNICATION_ACADEMIC_CONTENT_SESSION_REMINDER_GENERATE_JOB_NAME;
        if (
          reminder
            ? !isAcademicContentSessionReminderJobData(job.data)
            : !isAcademicContentNotificationGenerationJobData(job.data)
        )
          throw new Error('academic_content_notification_job_invalid');
        const data =
          job.data as CommunicationAcademicContentNotificationGenerationJobData;
        const context = createRequestContext(
          `academic-content-notification-generation:${job.id ?? data.publicationId}`,
        );
        if (
          job.name ===
            COMMUNICATION_ACADEMIC_CONTENT_NOTIFICATIONS_GENERATE_JOB_NAME &&
          data.actorUserId &&
          data.actorUserType
        )
          context.actor = {
            id: data.actorUserId,
            userType: data.actorUserType,
          };
        context.activeMembership = {
          membershipId: 'queue:academic-content-notification-generation',
          organizationId: data.organizationId,
          schoolId: data.schoolId,
          roleId: 'queue:academic-content-notification-generation',
          permissions: [],
        };
        await runWithRequestContext(context, () =>
          job.name ===
          COMMUNICATION_ACADEMIC_CONTENT_CANCELLATION_GENERATE_JOB_NAME
            ? this.academicContent.generateCancellation(data)
            : reminder
              ? this.academicContent.generateSessionReminder(
                  data as CommunicationAcademicContentSessionReminderJobData,
                )
              : this.academicContent.generate(data),
        );
        return;
      }
      if (
        job.name !==
          COMMUNICATION_ANNOUNCEMENT_NOTIFICATIONS_GENERATE_JOB_NAME ||
        !('announcementId' in job.data)
      ) {
        throw new Error('communication_notification_job_unknown');
      }

      const data = job.data;
      const context = createRequestContext(
        `communication-notification-generation:${job.id ?? data.announcementId}`,
      );
      if (data.actorUserId && data.actorUserType) {
        context.actor = {
          id: data.actorUserId,
          userType: data.actorUserType,
        };
      }
      context.activeMembership = {
        membershipId: 'queue:communication-notification-generation',
        organizationId: data.organizationId,
        schoolId: data.schoolId,
        roleId: 'queue:communication-notification-generation',
        permissions: [],
      };

      await runWithRequestContext(context, () =>
        this.generationService.generateForPublishedAnnouncement(data),
      );
    });
  }
}
