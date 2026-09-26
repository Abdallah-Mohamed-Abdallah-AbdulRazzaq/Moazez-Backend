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
import { AcademicContentLifecycleUseCases } from './application/academic-content-lifecycle.use-cases';
import { AcademicContentAudienceRepository } from './infrastructure/academic-content-audience.repository';
import { AcademicContentRepository } from './infrastructure/academic-content.repository';
import { AcademicContentTargetRepository } from './infrastructure/academic-content-target.repository';
import { AcademicContentTypeDetailRepository } from './infrastructure/academic-content-type-detail.repository';
import { AcademicContentTypeDetailUseCases } from './application/academic-content-type-detail.use-cases';
import { ACADEMIC_CONTENT_TYPE_DETAIL_UNIT_OF_WORK } from './application/academic-content-type-detail.unit-of-work';
import { AcademicContentLinksTagsRepository } from './infrastructure/academic-content-links-tags.repository';
import { AcademicContentRevisionRepository } from './infrastructure/academic-content-revision.repository';
import {
  ReplaceAcademicContentLinksUseCase,
  ReplaceAcademicContentTagsUseCase,
} from './application/replace-academic-content-links-tags.use-cases';
import {
  CaptureAcademicContentRevisionUseCase,
  GetAcademicContentRevisionUseCase,
  ListAcademicContentRevisionsUseCase,
} from './application/academic-content-revision.use-cases';
import { AcademicContentValidationRepository } from './infrastructure/academic-content-validation.repository';
import { AcademicContentController } from './controller/academic-content.controller';
import { AcademicContentFilePolicyController } from './controller/academic-content-file-policy.controller';
import {
  GetAcademicContentForManagementUseCase,
  ListAcademicContentForManagementUseCase,
} from './application/academic-content-management-read.use-cases';
import {
  GetAcademicContentFilePolicyUseCase,
  UpdateAcademicContentFilePolicyUseCase,
} from './files/application/academic-content-file-policy.use-cases';

@Module({
  imports: [StorageModule],
  controllers: [AcademicContentFilePolicyController, AcademicContentController],
  providers: [
    AcademicContentFileRepository,
    AcademicContentFilePolicyResolver,
    GetAcademicContentFilePolicyUseCase,
    UpdateAcademicContentFilePolicyUseCase,
    AcademicContentFileVerifier,
    CreateAcademicContentUploadUseCase,
    CompleteAcademicContentUploadUseCase,
    CancelAcademicContentUploadUseCase,
    UnlinkAcademicContentAssetUseCase,
    AcademicContentRepository,
    AcademicContentTargetRepository,
    AcademicContentTypeDetailRepository,
    {
      provide: ACADEMIC_CONTENT_TYPE_DETAIL_UNIT_OF_WORK,
      useExisting: AcademicContentTypeDetailRepository,
    },
    AcademicContentTypeDetailUseCases,
    AcademicContentLinksTagsRepository,
    AcademicContentRevisionRepository,
    AcademicContentValidationRepository,
    AcademicContentAudienceRepository,
    AcademicContentContextValidator,
    AcademicContentTargetValidator,
    CreateAcademicContentUseCase,
    AcademicContentLifecycleUseCases,
    ListAcademicContentForManagementUseCase,
    GetAcademicContentForManagementUseCase,
    ReplaceAcademicContentTargetsUseCase,
    AcademicContentTypeDetailUseCases,
    ReplaceAcademicContentLinksUseCase,
    ReplaceAcademicContentTagsUseCase,
    CaptureAcademicContentRevisionUseCase,
    ListAcademicContentRevisionsUseCase,
    GetAcademicContentRevisionUseCase,
    AcademicContentAudienceResolver,
  ],
  exports: [
    CreateAcademicContentUploadUseCase,
    CompleteAcademicContentUploadUseCase,
    CancelAcademicContentUploadUseCase,
    UnlinkAcademicContentAssetUseCase,
    CreateAcademicContentUseCase,
    AcademicContentLifecycleUseCases,
    ReplaceAcademicContentTargetsUseCase,
    CaptureAcademicContentRevisionUseCase,
    AcademicContentAudienceResolver,
  ],
})
export class AcademicContentModule {}
