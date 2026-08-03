import { Module, type Provider } from '@nestjs/common';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { LearningMediaCleanupService } from '../../modules/files/uploads/application/learning-media-cleanup.service';
import { LearningMediaRepository } from '../../modules/files/uploads/infrastructure/learning-media.repository';

export const MEDIA_WORKER_CONSUMER_PROVIDERS = Object.freeze([
  LearningMediaCleanupService,
] satisfies Provider[]);

@Module({
  imports: [QueueModule, StorageModule],
  providers: [LearningMediaRepository, ...MEDIA_WORKER_CONSUMER_PROVIDERS],
})
export class MediaWorkerConsumerModule {}
