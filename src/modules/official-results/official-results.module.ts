import { Module } from '@nestjs/common';
import { ResultExposureGuard } from './domain/result-exposure';
import { ResultIssueReportService } from './application/result-issue-report.service';
import { ResultNoticeService } from './application/result-notice.service';
import { ResultPeriodLifecycleService } from './application/result-period-lifecycle.service';
import { ResultReportsService } from './application/result-reports.service';
import {
  ResultReportsController,
  TeacherResultReportsController,
} from './controller/result-reports.controller';
import { QueueModule } from '../../infrastructure/queue/queue.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { ResultExportService } from './application/result-export.service';
import { ResultImportService } from './application/result-import.service';
import { ResultImportApplyService } from './application/result-import-apply.service';
import { ResultImportCommitGate } from './application/result-import-commit-gate';
import { ResultImportExecutionService } from './application/result-import-execution.service';
import { ResultImportValidationService } from './application/result-import-validation.service';
import { ResultImportWorkService } from './application/result-import-work.service';
import {
  ResultImportController,
  TeacherResultImportController,
} from './controller/result-import.controller';
import { ResultExportPlanService } from './application/result-export-plan.service';
import {
  ResultExportController,
  TeacherResultExportController,
} from './controller/result-export.controller';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { TeacherAllocationOperationalWriteGate } from '../academics/teacher-allocation/application/teacher-allocation-operational-write-gate';
import { PrismaTeacherAllocationOperationalWriteGate } from '../academics/teacher-allocation/infrastructure/prisma-teacher-allocation-operational-write-gate';
import { ResultCapabilitiesService } from './application/result-capabilities.service';
import { ResultCatalogService } from './application/result-catalog.service';
import { ResultDesignService } from './application/result-design.service';
import { ResultScopeService } from './application/result-scope.service';
import { ResultTemplateService } from './application/result-template.service';
import {
  ResultAuthoringController,
  TeacherResultAuthoringController,
} from './controller/result-authoring.controller';
import { ResultGrantService } from './application/result-grant.service';
import { ResultGradebookService } from './application/result-gradebook.service';
import { ResultFamilyService } from './application/result-family.service';
import { ResultAggregateService } from './application/result-aggregate.service';
import { ResultAggregateController } from './controller/result-aggregate.controller';
import { ResultAggregateRepository } from './infrastructure/repositories/result-aggregate.repository';
import {
  ParentOfficialResultsController,
  StudentOfficialResultsController,
} from './controller/result-family.controller';
import { ResultFamilyRepository } from './infrastructure/repositories/result-family.repository';
import { ResultReleaseService } from './application/result-release.service';
import { ResultReleaseSnapshotService } from './application/result-release-snapshot.service';
import {
  ResultReleaseController,
  TeacherResultReleaseController,
} from './controller/result-release.controller';
import { ResultReleaseRepository } from './infrastructure/repositories/result-release.repository';
import { ResultRosterReconcileService } from './application/result-roster-reconcile.service';
import { ResultPolicyService } from './application/result-policy.service';
import {
  ResultConfigurationController,
  TeacherResultConfigurationController,
} from './controller/result-configuration.controller';
import { ResultErrorFilter } from './controller/result-error.filter';
import {
  ResultGradebookController,
  TeacherResultGradebookController,
} from './controller/result-gradebook.controller';
import { ResultAuthorizationRepository } from './infrastructure/repositories/result-authorization.repository';
import { ResultCatalogRepository } from './infrastructure/repositories/result-catalog.repository';
import { ResultCommandRepository } from './infrastructure/repositories/result-command.repository';
import { ResultDesignRepository } from './infrastructure/repositories/result-design.repository';
import { ResultOperationRepository } from './infrastructure/repositories/result-operation.repository';
import { ResultPreviewRepository } from './infrastructure/repositories/result-preview.repository';
import { ResultTemplateRepository } from './infrastructure/repositories/result-template.repository';
import { ResultTemplateScopeRepository } from './infrastructure/repositories/result-template-scope.repository';
import { ResultFoundationRepository } from './infrastructure/repositories/result-foundation.repository';
import { ResultGrantRepository } from './infrastructure/repositories/result-grant.repository';
import { ResultGradebookRepository } from './infrastructure/repositories/result-gradebook.repository';
import { ResultRosterReconcileRepository } from './infrastructure/repositories/result-roster-reconcile.repository';
import { ResultPolicyRepository } from './infrastructure/repositories/result-policy.repository';
import { ResultRosterRepository } from './infrastructure/repositories/result-roster.repository';
import { ResultScopeFactsRepository } from './infrastructure/repositories/result-scope-facts.repository';

@Module({
  imports: [PrismaModule, QueueModule, StorageModule],
  providers: [
    ResultIssueReportService,
    ResultNoticeService,
    ResultPeriodLifecycleService,
    ResultReportsService,
    {
      provide: TeacherAllocationOperationalWriteGate,
      useClass: PrismaTeacherAllocationOperationalWriteGate,
    },
    ResultExportPlanService,
    ResultExportService,
    ResultImportService,
    ResultImportApplyService,
    ResultImportCommitGate,
    ResultImportExecutionService,
    ResultImportValidationService,
    ResultImportWorkService,
    ResultAggregateRepository,
    ResultAggregateService,
    ResultFamilyRepository,
    ResultFamilyService,
    ResultReleaseRepository,
    ResultReleaseService,
    ResultReleaseSnapshotService,
    ResultGradebookRepository,
    ResultRosterReconcileRepository,
    ResultGradebookService,
    ResultRosterReconcileService,
    ResultAuthorizationRepository,
    ResultCatalogRepository,
    ResultCommandRepository,
    ResultDesignRepository,
    ResultOperationRepository,
    ResultPreviewRepository,
    ResultTemplateRepository,
    ResultTemplateScopeRepository,
    ResultFoundationRepository,
    ResultGrantRepository,
    ResultPolicyRepository,
    ResultRosterRepository,
    ResultScopeFactsRepository,
    ResultCapabilitiesService,
    ResultCatalogService,
    ResultDesignService,
    ResultGrantService,
    ResultPolicyService,
    ResultScopeService,
    ResultTemplateService,
  ],
  exports: [
    ResultIssueReportService,
    ResultNoticeService,
    ResultPeriodLifecycleService,
    ResultReportsService,
    ResultImportApplyService,
    ResultImportExecutionService,
    ResultAggregateService,
    ResultCapabilitiesService,
    ResultCatalogService,
    ResultDesignService,
    ResultExportService,
    ResultImportService,
    ResultImportWorkService,
    ResultFamilyService,
    ResultGradebookService,
    ResultGrantService,
    ResultPolicyService,
    ResultReleaseService,
    ResultRosterReconcileService,
    ResultScopeService,
    ResultTemplateService,
  ],
})
export class OfficialResultsServicesModule {}

@Module({
  imports: [OfficialResultsServicesModule],
  controllers: [
    ResultReportsController,
    TeacherResultReportsController,
    ResultExportController,
    TeacherResultExportController,
    ResultImportController,
    TeacherResultImportController,
    ResultAggregateController,
    ParentOfficialResultsController,
    StudentOfficialResultsController,
    ResultReleaseController,
    TeacherResultReleaseController,
    ResultGradebookController,
    TeacherResultGradebookController,
    ResultAuthoringController,
    TeacherResultAuthoringController,
    ResultConfigurationController,
    TeacherResultConfigurationController,
  ],
  providers: [ResultErrorFilter, ResultExposureGuard],
})
export class OfficialResultsModule {}
