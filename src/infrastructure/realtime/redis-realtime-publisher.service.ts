import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Emitter } from '@socket.io/redis-emitter';
import type IORedis from 'ioredis';
import { REALTIME_NAMESPACE } from './realtime-contract';
import { conversationRoom, schoolRoom, userRoom } from './realtime-room-names';

export const REALTIME_EMITTER_REDIS_CLIENT = Symbol(
  'REALTIME_EMITTER_REDIS_CLIENT',
);

type RedisEmitterClient = Pick<IORedis, 'connect' | 'disconnect' | 'ping' | 'publish' | 'quit' | 'status' | 'on'>;

@Injectable()
export class RedisRealtimePublisherService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RedisRealtimePublisherService.name);
  private readonly emitter: Emitter;
  private connectPromise: Promise<void> | null = null;
  private closePromise: Promise<void> | null = null;
  private closing = false;

  constructor(
    @Inject(REALTIME_EMITTER_REDIS_CLIENT)
    private readonly redis: RedisEmitterClient,
  ) {
    this.redis.on('error', () => {
      if (!this.closing) this.logFailure('connection');
    });
    this.emitter = new Emitter({
      publish: (channel: string, message: string | Buffer): void => {
        if (this.closing) {
          this.logFailure('shutdown');
          return;
        }

        try {
          void this.redis
            .publish(channel, message)
            .catch(() => this.logFailure('emit'));
        } catch {
          this.logFailure('emit');
        }
      },
    }).of(REALTIME_NAMESPACE);
  }

  publishToSchool(
    schoolId: string,
    eventName: string,
    payload: unknown,
  ): boolean {
    return this.publish(schoolRoom(schoolId), eventName, payload);
  }

  onModuleInit(): Promise<void> {
    return this.checkReadiness();
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

  async checkReadiness(): Promise<void> {
    if (this.closing) throw new Error('realtime_emitter_redis_unavailable');
    try {
      await this.ensureConnected();
      await this.redis.ping();
    } catch {
      throw new Error('realtime_emitter_redis_unavailable');
    }
  }

  onModuleDestroy(): Promise<void> {
    if (!this.closePromise) this.closePromise = this.close();
    return this.closePromise;
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
    if (this.closing || this.redis.status !== 'ready') return false;

    try {
      this.emitter.to(roomName).emit(normalizedEventName, payload);
      return true;
    } catch {
      this.logFailure('emit');
      return false;
    }
  }

  private ensureConnected(): Promise<void> {
    if (this.redis.status === 'ready') return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    if (this.redis.status !== 'wait') {
      return Promise.reject(new Error('realtime_emitter_redis_unavailable'));
    }

    this.connectPromise = this.redis
      .connect()
      .then(() => undefined)
      .finally(() => {
        this.connectPromise = null;
      });
    return this.connectPromise;
  }

  private async close(): Promise<void> {
    this.closing = true;
    const connection = this.connectPromise;
    if (connection) await connection.catch(() => undefined);

    if (
      this.redis.status === 'ready' ||
      this.redis.status === 'connect' ||
      this.redis.status === 'connecting' ||
      this.redis.status === 'reconnecting'
    ) {
      try {
        await this.redis.quit();
        return;
      } catch (error) {
        this.redis.disconnect();
        throw error;
      }
    }

    this.redis.disconnect();
  }

  private logFailure(stage: 'connection' | 'emit' | 'shutdown'): void {
    this.logger.warn({
      event: 'realtime.publish.failed',
      transport: 'redis-emitter',
      stage,
    });
  }
}
