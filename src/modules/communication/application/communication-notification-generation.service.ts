import { Injectable } from '@nestjs/common';
import {
  buildAnnouncementNotificationMetadata,
  buildAnnouncementNotificationPreview,
  buildSkippedAnnouncementNotificationGenerationResult,
  CommunicationAnnouncementNotificationGenerationJobData,
  CommunicationAnnouncementNotificationGenerationResult,
  deduplicateRecipientUserIds,
  mapAnnouncementPriorityToNotificationPriority,
} from '../domain/communication-notification-generation-domain';
import { CommunicationNotificationGenerationRepository } from '../infrastructure/communication-notification-generation.repository';

@Injectable()
export class CommunicationNotificationGenerationService {
  constructor(
    private readonly communicationNotificationGenerationRepository: CommunicationNotificationGenerationRepository,
  ) {}

  async generateForPublishedAnnouncement(
    input: CommunicationAnnouncementNotificationGenerationJobData,
  ): Promise<CommunicationAnnouncementNotificationGenerationResult> {
    const announcement =
      await this.communicationNotificationGenerationRepository.findPublishedCurrentSchoolAnnouncementForNotificationGeneration(
        input.announcementId,
      );

    if (!announcement || announcement.schoolId !== input.schoolId) {
      return buildSkippedAnnouncementNotificationGenerationResult({
        announcementId: input.announcementId,
        reason: 'announcement_not_published_or_not_found',
      });
    }

    const recipientUserIds = deduplicateRecipientUserIds(
      await this.communicationNotificationGenerationRepository.resolveCurrentSchoolAnnouncementRecipientUserIds(
        announcement,
      ),
    );

    if (recipientUserIds.length === 0) {
      return buildSkippedAnnouncementNotificationGenerationResult({
        announcementId: announcement.id,
        reason: 'no_resolved_recipients',
      });
    }

    const result =
      await this.communicationNotificationGenerationRepository.createMissingAnnouncementPublishedNotifications(
        {
          schoolId: input.schoolId,
          announcementId: announcement.id,
          recipientUserIds,
          actorUserId:
            announcement.publishedById ??
            announcement.createdById ??
            input.actorUserId,
          title: announcement.title,
          body: buildAnnouncementNotificationPreview(announcement.body),
          priority: mapAnnouncementPriorityToNotificationPriority(
            announcement.priority,
          ),
          expiresAt: announcement.expiresAt,
          metadata: buildAnnouncementNotificationMetadata({
            announcementId: announcement.id,
            audienceType: announcement.audienceType,
            publishedAt: announcement.publishedAt,
          }),
          now: new Date(),
        },
      );

    return {
      announcementId: announcement.id,
      ...result,
      skippedReason: null,
    };
  }
}
