import { Injectable } from '@nestjs/common';
import { CommunicationModerationActionType } from '@prisma/client';
import { REALTIME_SERVER_EVENTS } from '../../../infrastructure/realtime/realtime-event-names';
import { RealtimePublisherService } from '../../../infrastructure/realtime/realtime-publisher.service';
import { CommunicationMessageAttachmentRecord } from '../infrastructure/communication-message-attachment.repository';
import {
  CommunicationConversationReadResult,
  CommunicationMessageReadRecord,
  CommunicationMessageRecord,
} from '../infrastructure/communication-message.repository';
import { CommunicationModerationMessageRecord } from '../infrastructure/communication-moderation.repository';
import { CommunicationMessageReactionRecord } from '../infrastructure/communication-reaction.repository';
import { presentCommunicationMessageAttachment } from '../presenters/communication-message-attachment.presenter';
import { presentCommunicationMessage } from '../presenters/communication-message.presenter';
import { presentModerationMessageMetadata } from '../presenters/communication-moderation.presenter';
import { presentCommunicationReaction } from '../presenters/communication-reaction.presenter';

@Injectable()
export class CommunicationRealtimeEventsService {
  constructor(private readonly publisher: RealtimePublisherService) {}

  publishMessageCreated(
    schoolId: string,
    message: CommunicationMessageRecord,
  ): void {
    if (!hasRequiredIds(schoolId, message.conversationId, message.id)) return;

    this.publisher.publishToConversation(
      schoolId,
      message.conversationId,
      REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_MESSAGE_CREATED,
      {
        conversationId: message.conversationId,
        message: presentCommunicationMessage(message),
        eventAt: eventTimestamp(),
      },
    );
  }

  publishMessageUpdated(
    schoolId: string,
    message: CommunicationMessageRecord,
  ): void {
    if (!hasRequiredIds(schoolId, message.conversationId, message.id)) return;

    this.publisher.publishToConversation(
      schoolId,
      message.conversationId,
      REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_MESSAGE_UPDATED,
      {
        conversationId: message.conversationId,
        message: presentCommunicationMessage(message),
        eventAt: eventTimestamp(),
      },
    );
  }

  publishModeratedMessageUpdated(
    schoolId: string,
    message: CommunicationModerationMessageRecord,
  ): void {
    if (!hasRequiredIds(schoolId, message.conversationId, message.id)) return;

    this.publisher.publishToConversation(
      schoolId,
      message.conversationId,
      REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_MESSAGE_UPDATED,
      {
        conversationId: message.conversationId,
        message: presentModerationMessageMetadata(message),
        eventAt: eventTimestamp(),
      },
    );
  }

  publishMessageDeleted(
    schoolId: string,
    message: CommunicationMessageRecord | CommunicationModerationMessageRecord,
  ): void {
    if (!hasRequiredIds(schoolId, message.conversationId, message.id)) return;

    this.publisher.publishToConversation(
      schoolId,
      message.conversationId,
      REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_MESSAGE_DELETED,
      {
        messageId: message.id,
        conversationId: message.conversationId,
        status: message.status.toLowerCase(),
        deletedAt: presentNullableDate(message.deletedAt),
        hiddenAt: presentNullableDate(message.hiddenAt),
        eventAt: eventTimestamp(),
      },
    );
  }

  publishMessageRead(
    schoolId: string,
    read: CommunicationMessageReadRecord,
  ): void {
    if (
      !hasRequiredIds(
        schoolId,
        read.conversationId,
        read.messageId,
        read.userId,
      )
    ) {
      return;
    }

    this.publisher.publishToConversation(
      schoolId,
      read.conversationId,
      REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_MESSAGE_READ,
      {
        conversationId: read.conversationId,
        messageId: read.messageId,
        readerId: read.userId,
        readAt: read.readAt.toISOString(),
        eventAt: eventTimestamp(),
      },
    );
  }

  publishConversationRead(params: {
    schoolId: string;
    readerId: string;
    result: CommunicationConversationReadResult;
  }): void {
    if (
      !hasRequiredIds(
        params.schoolId,
        params.result.conversationId,
        params.readerId,
      )
    ) {
      return;
    }

    this.publisher.publishToConversation(
      params.schoolId,
      params.result.conversationId,
      REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_MESSAGE_READ,
      {
        conversationId: params.result.conversationId,
        readerId: params.readerId,
        readAt: params.result.readAt.toISOString(),
        markedCount: params.result.markedCount,
        eventAt: eventTimestamp(),
      },
    );
  }

  publishReactionUpserted(
    schoolId: string,
    reaction: CommunicationMessageReactionRecord,
  ): void {
    if (
      !hasRequiredIds(
        schoolId,
        reaction.conversationId,
        reaction.messageId,
        reaction.id,
      )
    ) {
      return;
    }

    this.publisher.publishToConversation(
      schoolId,
      reaction.conversationId,
      REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_REACTION_UPSERTED,
      {
        conversationId: reaction.conversationId,
        messageId: reaction.messageId,
        reaction: presentCommunicationReaction(reaction),
        eventAt: eventTimestamp(),
      },
    );
  }

  publishReactionDeleted(
    schoolId: string,
    reaction: CommunicationMessageReactionRecord,
  ): void {
    if (
      !hasRequiredIds(
        schoolId,
        reaction.conversationId,
        reaction.messageId,
        reaction.userId,
      )
    ) {
      return;
    }

    this.publisher.publishToConversation(
      schoolId,
      reaction.conversationId,
      REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_REACTION_DELETED,
      {
        conversationId: reaction.conversationId,
        messageId: reaction.messageId,
        reactionId: reaction.id,
        userId: reaction.userId,
        actorId: reaction.userId,
        eventAt: eventTimestamp(),
      },
    );
  }

  publishAttachmentLinked(
    schoolId: string,
    attachment: CommunicationMessageAttachmentRecord,
  ): void {
    if (
      !hasRequiredIds(
        schoolId,
        attachment.conversationId,
        attachment.messageId,
        attachment.id,
      )
    ) {
      return;
    }

    this.publisher.publishToConversation(
      schoolId,
      attachment.conversationId,
      REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_ATTACHMENT_LINKED,
      {
        conversationId: attachment.conversationId,
        messageId: attachment.messageId,
        attachment: presentCommunicationMessageAttachment(attachment),
        eventAt: eventTimestamp(),
      },
    );
  }

  publishAttachmentDeleted(
    schoolId: string,
    attachment: CommunicationMessageAttachmentRecord,
  ): void {
    if (
      !hasRequiredIds(
        schoolId,
        attachment.conversationId,
        attachment.messageId,
        attachment.id,
      )
    ) {
      return;
    }

    this.publisher.publishToConversation(
      schoolId,
      attachment.conversationId,
      REALTIME_SERVER_EVENTS.COMMUNICATION_CHAT_ATTACHMENT_DELETED,
      {
        attachmentId: attachment.id,
        fileId: attachment.fileId,
        messageId: attachment.messageId,
        conversationId: attachment.conversationId,
        eventAt: eventTimestamp(),
      },
    );
  }

  publishModerationMessageStateChange(params: {
    schoolId: string;
    actionType: CommunicationModerationActionType;
    message: CommunicationModerationMessageRecord;
  }): void {
    if (
      params.actionType === CommunicationModerationActionType.MESSAGE_HIDDEN ||
      params.actionType === CommunicationModerationActionType.MESSAGE_DELETED
    ) {
      this.publishMessageDeleted(params.schoolId, params.message);
      return;
    }

    if (
      params.actionType === CommunicationModerationActionType.MESSAGE_UNHIDDEN
    ) {
      this.publishModeratedMessageUpdated(params.schoolId, params.message);
    }
  }
}

function hasRequiredIds(...values: Array<string | null | undefined>): boolean {
  return values.every(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );
}

function eventTimestamp(): string {
  return new Date().toISOString();
}

function presentNullableDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
