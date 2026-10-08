import { AcademicContentEngagementService } from './application/academic-content-engagement.service';
import { AcademicContentEngagementRepository } from './infrastructure/academic-content-engagement.repository';
import { AcademicContentEngagementExceptionFilter } from './controller/academic-content-engagement-exception.filter';
import { AcademicContentWorkflowPublicationCapabilities } from './application/academic-content-workflow-publication-capabilities';
import { AcademicContentReviewDecisionNotificationEnqueueService } from './application/academic-content-review-decision-notification-enqueue.service';
import { QueueModule } from '../../../infrastructure/queue/queue.module';
import { CommunicationNotificationQueueService } from '../../communication/application/communication-notification-queue.service';
import { AcademicContentPublicationQueueService } from './application/academic-content-publication-queue.service';
import { AcademicContentPublicationRuntimeRepository } from './infrastructure/academic-content-publication-runtime.repository';
import { AcademicContentPublicationLifecycleRepository } from './infrastructure/academic-content-publication-lifecycle.repository';
import {
  CancelAcademicContentPublicationUseCase,
  StartAcademicContentRevisionUseCase,
} from './application/academic-content-publication.use-cases';
import { Module } from '@nestjs/common';
import { TeacherAllocationModule } from '../teacher-allocation/teacher-allocation.module';
import { AcademicContentAuthoringOperations } from './application/academic-content-authoring.operations';
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
import { AcademicContentAssetAccessOperations } from './files/application/academic-content-asset-access.operations';
import { AcademicContentAuthorizedFileSigner } from './files/application/academic-content-authorized-file.signer';
import { AcademicContentRecipientAssetAccessService } from './files/application/academic-content-recipient-asset-access.service';
import { AcademicContentAudienceResolver } from './application/academic-content-audience.resolver';
import { AcademicContentContextValidator } from './application/academic-content-context-validator';
import { AcademicContentTargetValidator } from './application/academic-content-target-validator';
import { CreateAcademicContentUseCase } from './application/create-academic-content.use-case';
import { ReplaceAcademicContentTargetsUseCase } from './application/replace-academic-content-targets.use-case';
import { AcademicContentLifecycleUseCases } from './application/academic-content-lifecycle.use-cases';
import { AcademicContentAudienceRepository } from './infrastructure/academic-content-audience.repository';
import { AcademicContentRecipientReadRepository } from './infrastructure/academic-content-recipient-read.repository';
import { AcademicContentCurrentAccessService } from './application/academic-content-current-access.service';
import { AcademicContentRepository } from './infrastructure/academic-content.repository';
import { AcademicContentTargetRepository } from './infrastructure/academic-content-target.repository';
import { AcademicContentTypeDetailRepository } from './infrastructure/academic-content-type-detail.repository';
import { AcademicContentTypeDetailUseCases } from './application/academic-content-type-detail.use-cases';
import { GetAcademicContentReadinessUseCase } from './application/academic-content-readiness.use-case';
import { ACADEMIC_CONTENT_TYPE_DETAIL_UNIT_OF_WORK } from './application/academic-content-type-detail.unit-of-work';
import { AcademicContentLinksTagsRepository } from './infrastructure/academic-content-links-tags.repository';
import { AcademicContentRevisionRepository } from './infrastructure/academic-content-revision.repository';
import { AcademicContentPublicationRepository } from './infrastructure/academic-content-publication.repository';
import { AcademicContentPublicationSnapshotRepository } from './infrastructure/academic-content-publication-snapshot.repository';
import { AcademicContentRevisionAudienceResolver } from './infrastructure/academic-content-revision-audience.resolver';
import {
  ScheduleAcademicContentPublicationUseCase,
  UnscheduleAcademicContentPublicationUseCase,
  GetAcademicContentPublicationReadinessUseCase,
  ListAcademicContentPublicationHistoryUseCase,
  GetAcademicContentPublicationUseCase,
  GetAcademicContentAudiencePreviewUseCase,
} from './application/academic-content-publication.use-cases';
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
import { AcademicContentPreparationTemplateController } from './controller/academic-content-preparation-template.controller';
import { AcademicContentPreparationTemplateUseCases } from './application/academic-content-preparation-template.use-cases';
import { AcademicContentPreparationTemplateRepository } from './infrastructure/academic-content-preparation-template.repository';
import { AcademicContentFilePolicyController } from './controller/academic-content-file-policy.controller';
import { AcademicContentNotificationPolicyController } from './controller/academic-content-notification-policy.controller';
import { AcademicContentNotificationPolicyRepository } from './infrastructure/academic-content-notification-policy.repository';
import {
  GetAcademicContentNotificationPolicyUseCase,
  UpdateAcademicContentNotificationPolicyUseCase,
} from './application/academic-content-notification-policy.use-cases';
import { AcademicContentWorkflowPolicyController } from './controller/academic-content-workflow-policy.controller';
import { AcademicContentWorkflowController } from './controller/academic-content-workflow.controller';
import { AcademicContentWorkflowPolicyRepository } from './infrastructure/academic-content-workflow-policy.repository';
import { AcademicContentWorkflowRepository } from './infrastructure/academic-content-workflow.repository';
import { AcademicContentReviewRepository } from './infrastructure/academic-content-review.repository';
import {
  ListAcademicContentApprovalHistoryUseCase,
  ListAcademicContentReviewQueueUseCase,
} from './application/academic-content-review.use-cases';
import {
  ApproveAcademicContentUseCase,
  RequestAcademicContentChangesUseCase,
  SubmitAcademicContentUseCase,
} from './application/academic-content-workflow.use-cases';
import {
  GetAcademicContentWorkflowPolicyUseCase,
  UpdateAcademicContentWorkflowPolicyUseCase,
} from './application/academic-content-workflow-policy.use-cases';
import {
  GetAcademicContentForManagementUseCase,
  ListAcademicContentForManagementUseCase,
} from './application/academic-content-management-read.use-cases';
import {
  GetAcademicContentFilePolicyUseCase,
  UpdateAcademicContentFilePolicyUseCase,
} from './files/application/academic-content-file-policy.use-cases';

@Module({
  imports: [StorageModule, QueueModule, TeacherAllocationModule],
  controllers: [
    AcademicContentFilePolicyController,
    AcademicContentWorkflowPolicyController,
    AcademicContentNotificationPolicyController,
    AcademicContentWorkflowController,
    AcademicContentPreparationTemplateController,
    AcademicContentController,
  ],
  providers: [
    AcademicContentEngagementRepository,
    AcademicContentEngagementService,
    AcademicContentEngagementExceptionFilter,
    AcademicContentAuthorizedFileSigner,
    AcademicContentRecipientAssetAccessService,
    AcademicContentRecipientReadRepository,
    AcademicContentCurrentAccessService,
    AcademicContentReviewDecisionNotificationEnqueueService,
    AcademicContentWorkflowPublicationCapabilities,
    AcademicContentAssetAccessOperations,
    AcademicContentAuthoringOperations,
    CommunicationNotificationQueueService,
    AcademicContentPublicationQueueService,
    AcademicContentPublicationRuntimeRepository,
    AcademicContentPublicationLifecycleRepository,
    CancelAcademicContentPublicationUseCase,
    StartAcademicContentRevisionUseCase,
    AcademicContentRevisionAudienceResolver,
    AcademicContentPublicationSnapshotRepository,
    AcademicContentPublicationRepository,
    ScheduleAcademicContentPublicationUseCase,
    UnscheduleAcademicContentPublicationUseCase,
    GetAcademicContentPublicationReadinessUseCase,
    ListAcademicContentPublicationHistoryUseCase,
    GetAcademicContentPublicationUseCase,
    GetAcademicContentAudiencePreviewUseCase,
    AcademicContentPreparationTemplateRepository,
    AcademicContentPreparationTemplateUseCases,
    AcademicContentWorkflowPolicyRepository,
    AcademicContentNotificationPolicyRepository,
    GetAcademicContentNotificationPolicyUseCase,
    UpdateAcademicContentNotificationPolicyUseCase,
    AcademicContentWorkflowRepository,
    AcademicContentReviewRepository,
    ListAcademicContentReviewQueueUseCase,
    ListAcademicContentApprovalHistoryUseCase,
    SubmitAcademicContentUseCase,
    ApproveAcademicContentUseCase,
    RequestAcademicContentChangesUseCase,
    GetAcademicContentWorkflowPolicyUseCase,
    UpdateAcademicContentWorkflowPolicyUseCase,
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
    GetAcademicContentReadinessUseCase,
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
    AcademicContentEngagementService,
    AcademicContentEngagementExceptionFilter,
    AcademicContentRecipientAssetAccessService,
    AcademicContentCurrentAccessService,
    AcademicContentWorkflowPublicationCapabilities,
    SubmitAcademicContentUseCase,
    ScheduleAcademicContentPublicationUseCase,
    UnscheduleAcademicContentPublicationUseCase,
    GetAcademicContentPublicationReadinessUseCase,
    ListAcademicContentPublicationHistoryUseCase,
    GetAcademicContentPublicationUseCase,
    GetAcademicContentAudiencePreviewUseCase,
    ListAcademicContentRevisionsUseCase,
    GetAcademicContentRevisionUseCase,
    ListAcademicContentApprovalHistoryUseCase,
    AcademicContentAssetAccessOperations,
    AcademicContentPreparationTemplateUseCases,
    AcademicContentAuthoringOperations,
    GetAcademicContentReadinessUseCase,
    AcademicContentRepository,
    AcademicContentWorkflowPolicyRepository,
    AcademicContentFilePolicyResolver,
    CancelAcademicContentPublicationUseCase,
    StartAcademicContentRevisionUseCase,
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
