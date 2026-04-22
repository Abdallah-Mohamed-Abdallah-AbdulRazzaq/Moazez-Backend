import { Module } from '@nestjs/common';
import { StorageModule } from '../../../infrastructure/storage/storage.module';
import { GetFileDownloadUrlUseCase } from './application/get-file-download-url.use-case';
import { RegisterFileMetadataUseCase } from './application/register-file-metadata.use-case';
import { UploadFileUseCase } from './application/upload-file.use-case';
import { UploadsController } from './controller/uploads.controller';
import { FilesRepository } from './infrastructure/files.repository';

@Module({
  imports: [StorageModule],
  controllers: [UploadsController],
  providers: [
    FilesRepository,
    RegisterFileMetadataUseCase,
    UploadFileUseCase,
    GetFileDownloadUrlUseCase,
  ],
  exports: [
    FilesRepository,
    RegisterFileMetadataUseCase,
    UploadFileUseCase,
    GetFileDownloadUrlUseCase,
  ],
})
export class UploadsModule {}
