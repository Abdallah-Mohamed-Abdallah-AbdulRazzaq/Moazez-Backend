import { Module } from '@nestjs/common';
import { AttachmentsModule } from './attachments/attachments.module';
import { ImportsModule } from './imports/imports.module';
import { UploadsModule } from './uploads/uploads.module';
import { AssessmentMediaModule } from './assessment-media/assessment-media.module';

@Module({
  imports: [
    UploadsModule,
    AttachmentsModule,
    ImportsModule,
    AssessmentMediaModule,
  ],
})
export class FilesModule {}
