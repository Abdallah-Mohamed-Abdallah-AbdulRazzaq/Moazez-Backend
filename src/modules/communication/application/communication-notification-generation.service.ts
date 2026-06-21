import { Injectable } from '@nestjs/common';
import {
  CommunicationNotificationPreferenceCategory,
  CommunicationNotificationPriority,
  CommunicationNotificationType,
} from '@prisma/client';
import {
  buildAnnouncementNotificationMetadata,
  buildAnnouncementNotificationPreview,
  buildMessageNotificationMetadata,
  buildMessageNotificationPreview,
  buildSkippedAnnouncementNotificationGenerationResult,
  buildSkippedMessageNotificationGenerationResult,
  CommunicationAnnouncementNotificationGenerationJobData,
  CommunicationAnnouncementNotificationGenerationResult,
  CommunicationMessageNotificationGenerationInput,
  CommunicationMessageNotificationGenerationResult,
  deduplicateRecipientUserIds,
  mapAnnouncementPriorityToNotificationPriority,
} from '../domain/communication-notification-generation-domain';
import { CommunicationNotificationGenerationRepository } from '../infrastructure/communication-notification-generation.repository';
import { CommunicationRealtimeEventsService } from './communication-realtime-events.service';
import { CommunicationNotificationPreferenceService } from './communication-notification-preference.service';

@Injectable()
export class CommunicationNotificationGenerationService {
  constructor(
    private readonly communicationNotificationGenerationRepository: CommunicationNotificationGenerationRepository,
    private readonly communicationRealtimeEventsService: CommunicationRealtimeEventsService,
    private readonly communicationNotificationPreferenceService: CommunicationNotificationPreferenceService,
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

    const preferenceEnabledRecipientUserIds =
      await this.communicationNotificationPreferenceService.filterInAppEnabledRecipientUserIds(
        {
          schoolId: input.schoolId,
          recipientUserIds,
          category: CommunicationNotificationPreferenceCategory.ANNOUNCEMENT,
        },
      );

    if (preferenceEnabledRecipientUserIds.length === 0) {
      return buildSkippedAnnouncementNotificationGenerationResult({
        announcementId: announcement.id,
        reason: 'all_recipients_disabled_preferences',
      });
    }

    const { createdNotifications, ...result } =
      await this.communicationNotificationGenerationRepository.createMissingAnnouncementPublishedNotifications(
        {
          schoolId: input.schoolId,
          announcementId: announcement.id,
          recipientUserIds: preferenceEnabledRecipientUserIds,
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

    for (const notification of createdNotifications) {
      this.communicationRealtimeEventsService.publishNotificationCreated(
        input.schoolId,
        notification,
      );
    }

    return {
      announcementId: announcement.id,
      ...result,
      skippedReason: null,
    };
  }

  async generateForMessageCreated(
    input: CommunicationMessageNotificationGenerationInput,
  ): Promise<CommunicationMessageNotificationGenerationResult> {
    const message =
      await this.communicationNotificationGenerationRepository.findSentCurrentSchoolMessageForNotificationGeneration(
        input.messageId,
      );

    if (!message || message.schoolId !== input.schoolId) {
      return buildSkippedMessageNotificationGenerationResult({
        messageId: input.messageId,
        reason: 'message_not_found_or_notifiable_state',
      });
    }

    if (!message.senderUserId) {
      return buildSkippedMessageNotificationGenerationResult({
        messageId: message.id,
        reason: 'message_has_no_sender',
      });
    }

    const recipientUserIds = deduplicateRecipientUserIds(
      this.communicationNotificationGenerationRepository.resolveCurrentSchoolMessageRecipientUserIds(
        message,
      ),
    );

    if (recipientUserIds.length === 0) {
      return buildSkippedMessageNotificationGenerationResult({
        messageId: message.id,
        reason: 'no_eligible_recipients',
      });
    }

    const preferenceEnabledRecipientUserIds =
      await this.communicationNotificationPreferenceService.filterInAppEnabledRecipientUserIds(
        {
          schoolId: input.schoolId,
          recipientUserIds,
          category:
            CommunicationNotificationPreferenceCategory.MESSAGE_RECEIVED,
        },
      );

    if (preferenceEnabledRecipientUserIds.length === 0) {
      return buildSkippedMessageNotificationGenerationResult({
        messageId: message.id,
        reason: 'all_recipients_disabled_preferences',
      });
    }

    const { createdNotifications, ...result } =
      await this.communicationNotificationGenerationRepository.createMissingMessageNotifications(
        {
          schoolId: input.schoolId,
          messageId: message.id,
          conversationId: message.conversationId,
          recipientUserIds: preferenceEnabledRecipientUserIds,
          actorUserId: message.senderUserId ?? input.actorUserId,
          title: 'New message',
          body: buildMessageNotificationPreview({
            kind: message.kind,
            body: message.body,
          }),
          type: CommunicationNotificationType.MESSAGE_RECEIVED,
          priority: CommunicationNotificationPriority.NORMAL,
          metadata: buildMessageNotificationMetadata({
            conversationId: message.conversationId,
            messageId: message.id,
            sentAt: message.sentAt,
          }),
          now: new Date(),
        },
      );

    for (const notification of createdNotifications) {
      this.communicationRealtimeEventsService.publishNotificationCreated(
        input.schoolId,
        notification,
      );
    }

    return {
      messageId: message.id,
      ...result,
      skippedReason: null,
    };
  }
}
