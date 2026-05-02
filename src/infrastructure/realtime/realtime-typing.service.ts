import { Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { RealtimeCommunicationAccessService } from './realtime-communication-access.service';
import { REALTIME_SERVER_EVENTS } from './realtime-event-names';
import { RealtimePublisherService } from './realtime-publisher.service';
import { RealtimeStateStoreService } from './realtime-state-store.service';

const TYPING_TTL_SECONDS = 8;

export interface RealtimeTypingCommandInput {
  schoolId: string;
  conversationId: string;
  userId: string;
  permissions: string[];
}

export interface RealtimeTypingStartedPayload {
  conversationId: string;
  userId: string;
  startedAt: string;
  expiresAt: string;
}

export interface RealtimeTypingStoppedPayload {
  conversationId: string;
  userId: string;
  stoppedAt: string;
}

@Injectable()
export class RealtimeTypingService {
  constructor(
    private readonly stateStore: RealtimeStateStoreService,
    private readonly communicationAccessService: RealtimeCommunicationAccessService,
    private readonly publisher: RealtimePublisherService,
  ) {}

  async startTyping(
    input: RealtimeTypingCommandInput,
  ): Promise<RealtimeTypingStartedPayload> {
    await this.assertConversationAccess(input);

    const typingState = await this.stateStore.setTyping(
      input.schoolId,
      input.conversationId,
      input.userId,
      TYPING_TTL_SECONDS,
    );
    const payload: RealtimeTypingStartedPayload = {
      conversationId: input.conversationId,
      userId: input.userId,
      startedAt: typingState.startedAt,
      expiresAt: typingState.expiresAt,
    };

    this.publisher.publishToConversation(
      input.schoolId,
      input.conversationId,
      REALTIME_SERVER_EVENTS.COMMUNICATION_TYPING_STARTED,
      payload,
    );

    return payload;
  }

  async stopTyping(
    input: RealtimeTypingCommandInput,
  ): Promise<RealtimeTypingStoppedPayload> {
    await this.assertConversationAccess(input);

    await this.stateStore.clearTyping(
      input.schoolId,
      input.conversationId,
      input.userId,
    );

    const payload: RealtimeTypingStoppedPayload = {
      conversationId: input.conversationId,
      userId: input.userId,
      stoppedAt: new Date().toISOString(),
    };

    this.publisher.publishToConversation(
      input.schoolId,
      input.conversationId,
      REALTIME_SERVER_EVENTS.COMMUNICATION_TYPING_STOPPED,
      payload,
    );

    return payload;
  }

  private async assertConversationAccess(
    input: RealtimeTypingCommandInput,
  ): Promise<void> {
    const hasAccess =
      await this.communicationAccessService.canJoinConversationRoom({
        conversationId: input.conversationId,
        actorId: input.userId,
        permissions: input.permissions,
      });

    if (!hasAccess) {
      throw new WsException({
        code: 'communication.conversation.not_member',
      });
    }
  }
}
