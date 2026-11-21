import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { TeacherAllocationModule } from '../academics/teacher-allocation/teacher-allocation.module';
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
import { ResultPolicyService } from './application/result-policy.service';
import {
  ResultConfigurationController,
  TeacherResultConfigurationController,
} from './controller/result-configuration.controller';
import { ResultErrorFilter } from './controller/result-error.filter';
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
import { ResultPolicyRepository } from './infrastructure/repositories/result-policy.repository';
import { ResultRosterRepository } from './infrastructure/repositories/result-roster.repository';
import { ResultScopeFactsRepository } from './infrastructure/repositories/result-scope-facts.repository';

@Module({
  imports: [PrismaModule, TeacherAllocationModule],
  controllers: [
    ResultAuthoringController,
    TeacherResultAuthoringController,
    ResultConfigurationController,
    TeacherResultConfigurationController,
  ],
  providers: [
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
    ResultErrorFilter,
  ],
})
export class OfficialResultsModule {}
