import { Module } from '@nestjs/common';
import { StorageModule } from '../../../infrastructure/storage/storage.module';
import { AcademicContentFilePolicyResolver } from './files/application/academic-content-file-policy.resolver';
import { AcademicContentFileVerifier } from './files/application/academic-content-file-verifier';
import {
  CancelAcademicContentUploadUseCase,
  CompleteAcademicContentUploadUseCase,
  CreateAcademicContentUploadUseCase,
  UnlinkAcademicContentAssetUseCase,
} from './files/application/academic-content-upload.use-cases';
import { AcademicContentFileRepository } from './files/infrastructure/academic-content-file.repository';
import { AcademicContentAudienceResolver } from './application/academic-content-audience.resolver';
import { AcademicContentContextValidator } from './application/academic-content-context-validator';
import { AcademicContentTargetValidator } from './application/academic-content-target-validator';
import { CreateAcademicContentUseCase } from './application/create-academic-content.use-case';
import { ReplaceAcademicContentTargetsUseCase } from './application/replace-academic-content-targets.use-case';
import { AcademicContentAudienceRepository } from './infrastructure/academic-content-audience.repository';
import { AcademicContentRepository } from './infrastructure/academic-content.repository';

@Module({
  imports: [StorageModule],
  providers: [
    AcademicContentFileRepository,
    AcademicContentFilePolicyResolver,
    AcademicContentFileVerifier,
    CreateAcademicContentUploadUseCase,
    CompleteAcademicContentUploadUseCase,
    CancelAcademicContentUploadUseCase,
    UnlinkAcademicContentAssetUseCase,
    AcademicContentRepository,
    AcademicContentAudienceRepository,
    AcademicContentContextValidator,
    AcademicContentTargetValidator,
    CreateAcademicContentUseCase,
    ReplaceAcademicContentTargetsUseCase,
    AcademicContentAudienceResolver,
  ],
  exports: [
    CreateAcademicContentUploadUseCase,
    CompleteAcademicContentUploadUseCase,
    CancelAcademicContentUploadUseCase,
    UnlinkAcademicContentAssetUseCase,
    CreateAcademicContentUseCase,
    ReplaceAcademicContentTargetsUseCase,
    AcademicContentAudienceResolver,
  ],
})
export class AcademicContentModule {}
