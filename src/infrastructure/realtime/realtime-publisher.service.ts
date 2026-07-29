import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import { conversationRoom, schoolRoom, userRoom } from './realtime-room-names';

@Injectable()
export class RealtimePublisherService {
  private readonly logger = new Logger(RealtimePublisherService.name);
  private server?: Pick<Server, 'to'>;

  bindServer(server: Pick<Server, 'to'>): void {
    this.server = server;
  }

  publishToSchool(
    schoolId: string,
    eventName: string,
    payload: unknown,
  ): boolean {
    return this.publish(schoolRoom(schoolId), eventName, payload);
  }

  publishToUser(
    schoolId: string,
    userId: string,
    eventName: string,
    payload: unknown,
  ): boolean {
    return this.publish(userRoom(schoolId, userId), eventName, payload);
  }

  publishToConversation(
    schoolId: string,
    conversationId: string,
    eventName: string,
    payload: unknown,
  ): boolean {
    return this.publish(
      conversationRoom(schoolId, conversationId),
      eventName,
      payload,
    );
  }

  private publish(
    roomName: string,
    eventName: string,
    payload: unknown,
  ): boolean {
    const normalizedEventName = eventName.trim();
    if (!normalizedEventName) {
      throw new Error('eventName is required for realtime publishing');
    }

    if (!this.server) return false;

    try {
      this.server.to(roomName).emit(normalizedEventName, payload);
      return true;
    } catch {
      this.logger.warn({
        event: 'realtime.publish.failed',
        stage: 'emit',
      });
      return false;
    }
  }
}
