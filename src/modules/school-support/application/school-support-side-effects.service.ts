import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationPreferenceCategory,
  CommunicationNotificationPriority,
  CommunicationNotificationSourceModule,
  CommunicationNotificationType,
} from '@prisma/client';
import { REALTIME_SERVER_EVENTS } from '../../../infrastructure/realtime/realtime-event-names';
import { RealtimePublisherService } from '../../../infrastructure/realtime/realtime-publisher.service';
import { CommunicationNotificationCommandService } from '../../communication/application/communication-notification-command.service';
import { presentCommunicationRealtimeNotification } from '../../communication/presenters/communication-app-notification.presenter';
import { PlatformSupportScope, SchoolSupportScope } from '../school-support-context';
import {
  SCHOOL_SUPPORT_NOTIFICATION_SOURCE_TYPE,
  SCHOOL_SUPPORT_SURFACE,
} from '../domain/school-support.constants';
import {
  SchoolSupportRepository,
  SupportMessageRecord,
  SupportReadResult,
} from '../infrastructure/school-support.repository';
import { presentSupportMessageEvent } from '../presenters/school-support.presenter';

@Injectable()
export class SchoolSupportSideEffectsService {
  private readonly logger = new Logger(SchoolSupportSideEffectsService.name);

  constructor(
    private readonly repository: SchoolSupportRepository,
    private readonly realtimePublisher: RealtimePublisherService,
    @Optional()
    private readonly notificationCommandService?: CommunicationNotificationCommandService,
  ) {}

  async afterSchoolMessageCreated(input: {
    scope: SchoolSupportScope;
    message: SupportMessageRecord;
  }): Promise<void> {
    this.publishMessageCreatedSafely(input.message);
    await this.createMessageNotificationsSafely({
      message: input.message,
      target: 'platform',
      title: 'New school support message',
    });
  }

  async afterPlatformReplyCreated(input: {
    scope: PlatformSupportScope;
    message: SupportMessageRecord;
  }): Promise<void> {
    this.publishMessageCreatedSafely(input.message);
    await this.createMessageNotificationsSafely({
      message: input.message,
      target: 'school',
      title: 'Moazez Support',
    });
  }

  afterSchoolConversationRead(input: {
    scope: SchoolSupportScope;
    result: SupportReadResult;
  }): void {
    this.publishConversationReadSafely({
      result: input.result,
      readerKind: 'school',
    });
  }

  afterPlatformConversationRead(input: {
    scope: PlatformSupportScope;
    result: SupportReadResult;
  }): void {
    this.publishConversationReadSafely({
      result: input.result,
      readerKind: 'support',
    });
  }

  private publishMessageCreatedSafely(message: SupportMessageRecord): void {
    try {
      this.realtimePublisher.publishToConversation(
        message.schoolId,
        message.conversationId,
        REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_MESSAGE_CREATED,
        {
          conversationId: message.conversationId,
          message: presentSupportMessageEvent(message),
          eventAt: new Date().toISOString(),
        },
      );
    } catch (error) {
      this.logger.warn(
        `School support message realtime publish failed for message ${message.id}: ${formatError(
          error,
        )}`,
      );
    }
  }

  private publishConversationReadSafely(input: {
    result: SupportReadResult;
    readerKind: 'school' | 'support';
  }): void {
    try {
      this.realtimePublisher.publishToConversation(
        input.result.schoolId,
        input.result.conversationId,
        REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_MESSAGE_READ,
        {
          conversationId: input.result.conversationId,
          reader: { kind: input.readerKind },
          readAt: input.result.readAt.toISOString(),
          markedCount: input.result.markedCount,
          eventAt: new Date().toISOString(),
        },
      );
    } catch (error) {
      this.logger.warn(
        `School support read realtime publish failed for conversation ${input.result.conversationId}: ${formatError(
          error,
        )}`,
      );
    }
  }

  private async createMessageNotificationsSafely(input: {
    message: SupportMessageRecord;
    target: 'school' | 'platform';
    title: string;
  }): Promise<void> {
    if (!this.notificationCommandService) return;

    try {
      const recipients = await this.repository.listSupportNotificationRecipients({
        schoolId: input.message.schoolId,
        conversationId: input.message.conversationId,
        senderUserId: input.message.senderUserId,
        target: input.target,
      });

      await Promise.all(
        recipients.map(async (recipient) => {
          const result =
            await this.notificationCommandService!.createOrReuseNotification({
              schoolId: input.message.schoolId,
              recipientUserId: recipient.userId,
              actorUserId: null,
              sourceModule: CommunicationNotificationSourceModule.COMMUNICATION,
              sourceType: SCHOOL_SUPPORT_NOTIFICATION_SOURCE_TYPE,
              sourceId: input.message.id,
              idempotencyKey: buildNotificationIdempotencyKey({
                messageId: input.message.id,
                recipientUserId: recipient.userId,
              }),
              type: CommunicationNotificationType.MESSAGE_RECEIVED,
              title: input.title,
              body: buildNotificationPreview(input.message.body),
              priority: CommunicationNotificationPriority.NORMAL,
              metadata: {
                supportConversation: true,
                surface: SCHOOL_SUPPORT_SURFACE,
                conversationId: input.message.conversationId,
                messageId: input.message.id,
              },
              deliveryChannels: [
                CommunicationNotificationDeliveryChannel.IN_APP,
              ],
              preferenceCategory:
                CommunicationNotificationPreferenceCategory.MESSAGE_RECEIVED,
            });

          if (result.notification && result.createdNotification) {
            this.publishNotificationCreatedSafely({
              schoolId: input.message.schoolId,
              notification: result.notification,
            });
          }
        }),
      );
    } catch (error) {
      this.logger.warn(
        `School support notification generation failed for message ${input.message.id}: ${formatError(
          error,
        )}`,
      );
    }
  }

  private publishNotificationCreatedSafely(input: {
    schoolId: string;
    notification: Parameters<typeof presentCommunicationRealtimeNotification>[0];
  }): void {
    try {
      this.realtimePublisher.publishToUser(
        input.schoolId,
        input.notification.recipientUserId,
        REALTIME_SERVER_EVENTS.COMMUNICATION_NOTIFICATION_CREATED,
        {
          notification: presentCommunicationRealtimeNotification(
            input.notification,
          ),
          eventAt: new Date().toISOString(),
        },
      );
    } catch (error) {
      this.logger.warn(
        `School support notification realtime publish failed for notification ${input.notification.id}: ${formatError(
          error,
        )}`,
      );
    }
  }
}

function buildNotificationPreview(body: string | null): string {
  const preview = (body ?? '').replace(/\s+/g, ' ').trim();
  if (!preview) return 'New support message';
  return preview.length <= 160 ? preview : `${preview.slice(0, 157)}...`;
}

function buildNotificationIdempotencyKey(input: {
  messageId: string;
  recipientUserId: string;
}): string {
  return `school-support:${input.messageId}:${input.recipientUserId}`;
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'unknown error';
}
