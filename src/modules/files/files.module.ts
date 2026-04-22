import { Module } from '@nestjs/common';
import { AttachmentsModule } from './attachments/attachments.module';
import { ImportsModule } from './imports/imports.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [UploadsModule, AttachmentsModule, ImportsModule],
})
export class FilesModule {}
