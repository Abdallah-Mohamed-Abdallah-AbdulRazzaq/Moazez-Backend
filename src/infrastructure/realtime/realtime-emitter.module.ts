import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { RealtimePublisherService } from './realtime-publisher.service';
import {
  REALTIME_EMITTER_REDIS_CLIENT,
  RedisRealtimePublisherService,
} from './redis-realtime-publisher.service';

const REALTIME_EMITTER_CONNECT_TIMEOUT_MS = 400;
const REALTIME_EMITTER_COMMAND_TIMEOUT_MS = 400;
const REALTIME_EMITTER_RECONNECT_DELAY_MAX_MS = 1000;

export function createRealtimeEmitterRedisClient(redisUrl: string): IORedis {
  return new IORedis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    autoResendUnfulfilledCommands: false,
    maxRetriesPerRequest: 0,
    connectTimeout: REALTIME_EMITTER_CONNECT_TIMEOUT_MS,
    commandTimeout: REALTIME_EMITTER_COMMAND_TIMEOUT_MS,
    connectionName: 'moazez-realtime-emitter',
    retryStrategy: (attempt) =>
      Math.min(
        50 * 2 ** Math.min(attempt - 1, 5),
        REALTIME_EMITTER_RECONNECT_DELAY_MAX_MS,
      ),
  });
}

@Module({
  providers: [
    {
      provide: REALTIME_EMITTER_REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): IORedis =>
        createRealtimeEmitterRedisClient(
          config.getOrThrow<string>('REALTIME_REDIS_URL'),
        ),
    },
    RedisRealtimePublisherService,
    {
      provide: RealtimePublisherService,
      useExisting: RedisRealtimePublisherService,
    },
  ],
  exports: [RealtimePublisherService, RedisRealtimePublisherService],
})
export class RealtimeEmitterModule {}
