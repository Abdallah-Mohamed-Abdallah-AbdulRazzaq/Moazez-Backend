import { Module } from '@nestjs/common';
import { StorageModule } from '../../../../../infrastructure/storage/storage.module';
import { LessonContentPlaybackCoordinator } from './lesson-content-playback.coordinator';

@Module({
  imports: [StorageModule],
  providers: [LessonContentPlaybackCoordinator],
  exports: [LessonContentPlaybackCoordinator],
})
export class LessonContentPlaybackModule {}
