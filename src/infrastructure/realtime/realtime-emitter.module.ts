import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import { RealtimePublisherService } from './realtime-publisher.service';
import {
  REALTIME_EMITTER_REDIS_CLIENT,
  RedisRealtimePublisherService,
} from './redis-realtime-publisher.service';

@Module({
  providers: [
    {
      provide: REALTIME_EMITTER_REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): IORedis =>
        new IORedis(config.getOrThrow<string>('REDIS_URL'), {
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 0,
          connectTimeout: 400,
          commandTimeout: 400,
          retryStrategy: () => null,
        }),
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
