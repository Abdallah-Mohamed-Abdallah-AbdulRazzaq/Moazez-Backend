import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApplicationLifecycleModule } from '../../bootstrap/application-lifecycle.module';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { OperationalProbeModule } from '../../modules/health/operational-probe.module';
import { MediaWorkerConsumerModule } from './media-worker-consumer.module';
import { validateMediaWorkerEnv } from '../runtime-env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: true,
      validate: validateMediaWorkerEnv,
    }),
    ApplicationLifecycleModule,
    PrismaModule,
    QueueModule,
    StorageModule,
    MediaWorkerConsumerModule,
    OperationalProbeModule.forRole('media-worker'),
  ],
})
export class MediaWorkerRuntimeModule {}
