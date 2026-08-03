import { Module } from '@nestjs/common';
import { StorageModule } from '../../../infrastructure/storage/storage.module';
import { LearningMediaUnitOfWork } from './application/learning-media.unit-of-work';
import {
  CancelLearningMediaUploadUseCase,
  CompleteLearningMediaUploadUseCase,
  CreateLearningMediaUploadUseCase,
  VerifyLegacyLearningMediaUseCase,
} from './application/learning-media-upload.use-cases';
import { MediaVerifierService } from './application/media-verifier.service';
import { MediaRuntimeStartupGuard } from './application/media-runtime-startup.guard';
import { GetFileDownloadUrlUseCase } from './application/get-file-download-url.use-case';
import { RegisterFileMetadataUseCase } from './application/register-file-metadata.use-case';
import { UploadFileUseCase } from './application/upload-file.use-case';
import { UploadsController } from './controller/uploads.controller';
import { FilesRepository } from './infrastructure/files.repository';
import { LearningMediaRepository } from './infrastructure/learning-media.repository';
import { PrismaLearningMediaUnitOfWork } from './infrastructure/prisma-learning-media.unit-of-work';

@Module({
  imports: [StorageModule],
  controllers: [UploadsController],
  providers: [
    FilesRepository,
    RegisterFileMetadataUseCase,
    UploadFileUseCase,
    GetFileDownloadUrlUseCase,
    LearningMediaRepository,
    {
      provide: LearningMediaUnitOfWork,
      useClass: PrismaLearningMediaUnitOfWork,
    },
    MediaVerifierService,
    MediaRuntimeStartupGuard,
    CreateLearningMediaUploadUseCase,
    CompleteLearningMediaUploadUseCase,
    CancelLearningMediaUploadUseCase,
    VerifyLegacyLearningMediaUseCase,
  ],
  exports: [
    FilesRepository,
    RegisterFileMetadataUseCase,
    UploadFileUseCase,
    GetFileDownloadUrlUseCase,
    CreateLearningMediaUploadUseCase,
    CompleteLearningMediaUploadUseCase,
    CancelLearningMediaUploadUseCase,
    VerifyLegacyLearningMediaUseCase,
    MediaRuntimeStartupGuard,
  ],
})
export class UploadsModule {}
