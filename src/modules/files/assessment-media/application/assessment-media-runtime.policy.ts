import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssessmentMediaException } from '../domain/assessment-media.contract';

@Injectable()
export class AssessmentMediaRuntimePolicy {
  constructor(private readonly config: ConfigService) {}

  assertUploadExecutionEnabled(): void {
    if (
      this.config.get<string>('NODE_ENV') === 'production' ||
      this.config.get<boolean>('ASSESSMENT_MEDIA_UPLOADS_ENABLED', false) !==
        true
    )
      throw new AssessmentMediaException('disabled');
  }
}
