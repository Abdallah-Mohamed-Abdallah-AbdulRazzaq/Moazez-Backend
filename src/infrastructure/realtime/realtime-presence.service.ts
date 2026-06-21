import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  normalizeRealtimeActorCard,
  RealtimeActorCard,
} from './realtime-actor-card';
import { RealtimeCommunicationAccessService } from './realtime-communication-access.service';
import { REALTIME_SERVER_EVENTS } from './realtime-event-names';
import type {
  RealtimePresenceEventPayload,
  RealtimePresenceSnapshotItem,
} from './realtime-presence.types';
import { RealtimePublisherService } from './realtime-publisher.service';
import { RealtimeStateStoreService } from './realtime-state-store.service';

const PRESENCE_TTL_SECONDS = 90;
const PRESENCE_REFRESH_INTERVAL_MS = 30_000;

interface RealtimePresenceSocketInput {
  schoolId?: string | null;
  userId?: string | null;
  socketId?: string | null;
  actor?: RealtimeActorCard | null;
}

@Injectable()
export class RealtimePresenceService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimePresenceService.name);
  private readonly localSockets = new Map<
    string,
    { schoolId: string; userId: string; socketId: string }
  >();
  private readonly refreshTimer: NodeJS.Timeout;

  constructor(
    private readonly stateStore: RealtimeStateStoreService,
    private readonly publisher: RealtimePublisherService,
    private readonly communicationAccessService: RealtimeCommunicationAccessService,
  ) {
    this.refreshTimer = setInterval(
      () => void this.refreshLocalPresence(),
      PRESENCE_REFRESH_INTERVAL_MS,
    );
    this.refreshTimer.unref?.();
  }

  async registerSocket(
    input: RealtimePresenceSocketInput,
  ): Promise<RealtimePresenceEventPayload | null> {
    const normalized = normalizePresenceSocketInput(input);
    if (!normalized) return null;

    this.localSockets.set(localSocketKey(normalized), normalized);

    const result = await this.stateStore.incrementPresence(
      normalized.schoolId,
      normalized.userId,
      normalized.socketId,
      PRESENCE_TTL_SECONDS,
    );

    if (!result.transitionedOnline) return null;

    return this.publishPresenceTransition({
      schoolId: normalized.schoolId,
      userId: normalized.userId,
      online: true,
      updatedAt: result.updatedAt,
      actor: normalized.actor,
    });
  }

  async unregisterSocket(
    input: RealtimePresenceSocketInput,
  ): Promise<RealtimePresenceEventPayload | null> {
    const normalized = normalizePresenceSocketInput(input);
    if (!normalized) return null;

    this.localSockets.delete(localSocketKey(normalized));

    const result = await this.stateStore.decrementPresence(
      normalized.schoolId,
      normalized.userId,
      normalized.socketId,
      PRESENCE_TTL_SECONDS,
    );

    if (!result.transitionedOffline) return null;

    return this.publishPresenceTransition({
      schoolId: normalized.schoolId,
      userId: normalized.userId,
      online: false,
      updatedAt: result.updatedAt,
      actor: normalized.actor,
    });
  }

  getPresenceSnapshot(
    schoolId: string,
  ): Promise<RealtimePresenceSnapshotItem[]> {
    return this.stateStore.getPresenceSnapshot(schoolId);
  }

  onModuleDestroy(): void {
    clearInterval(this.refreshTimer);
  }

  private publishPresenceTransition(input: {
    schoolId: string;
    userId: string;
    online: boolean;
    updatedAt: string;
    actor: RealtimeActorCard;
  }): Promise<RealtimePresenceEventPayload> {
    const payload: RealtimePresenceEventPayload = {
      userId: input.userId,
      status: input.online ? 'online' : 'offline',
      online: input.online,
      updatedAt: input.updatedAt,
      actor: normalizeRealtimeActorCard(input.actor),
    };

    return this.publishPresenceToConversationRooms(input, payload);
  }

  private async publishPresenceToConversationRooms(
    input: {
      schoolId: string;
      userId: string;
    },
    payload: RealtimePresenceEventPayload,
  ): Promise<RealtimePresenceEventPayload> {
    const conversationIds =
      await this.communicationAccessService.listPresenceConversationIdsForActor(
        {
          actorId: input.userId,
        },
      );

    for (const conversationId of conversationIds) {
      this.publisher.publishToConversation(
        input.schoolId,
        conversationId,
        REALTIME_SERVER_EVENTS.COMMUNICATION_PRESENCE_USER_UPDATED,
        payload,
      );
    }

    return payload;
  }

  private async refreshLocalPresence(): Promise<void> {
    const sockets = [...this.localSockets.values()];

    await Promise.all(
      sockets.map(async (socket) => {
        try {
          await this.stateStore.refreshPresence(
            socket.schoolId,
            socket.userId,
            socket.socketId,
            PRESENCE_TTL_SECONDS,
          );
        } catch (error) {
          this.logger.warn(
            `Realtime presence refresh failed: ${getErrorMessage(error)}`,
          );
        }
      }),
    );
  }
}

function normalizePresenceSocketInput(input: RealtimePresenceSocketInput): {
  schoolId: string;
  userId: string;
  socketId: string;
  actor: RealtimeActorCard;
} | null {
  const schoolId = normalizeOptionalId(input.schoolId);
  const userId = normalizeOptionalId(input.userId);
  const socketId = normalizeOptionalId(input.socketId);

  if (!schoolId || !userId || !socketId) return null;

  return {
    schoolId,
    userId,
    socketId,
    actor: normalizeRealtimeActorCard(input.actor),
  };
}

function normalizeOptionalId(value?: string | null): string | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function localSocketKey(input: {
  schoolId: string;
  userId: string;
  socketId: string;
}): string {
  return `${input.schoolId}:${input.userId}:${input.socketId}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'unknown_error';
}
