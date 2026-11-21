import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { TeacherAllocationModule } from '../academics/teacher-allocation/teacher-allocation.module';
import { ResultCapabilitiesService } from './application/result-capabilities.service';
import { ResultCatalogService } from './application/result-catalog.service';
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
import { ResultFoundationRepository } from './infrastructure/repositories/result-foundation.repository';
import { ResultGrantRepository } from './infrastructure/repositories/result-grant.repository';
import { ResultPolicyRepository } from './infrastructure/repositories/result-policy.repository';
import { ResultRosterRepository } from './infrastructure/repositories/result-roster.repository';
import { ResultScopeFactsRepository } from './infrastructure/repositories/result-scope-facts.repository';

@Module({
  imports: [PrismaModule, TeacherAllocationModule],
  controllers: [
    ResultConfigurationController,
    TeacherResultConfigurationController,
  ],
  providers: [
    ResultAuthorizationRepository,
    ResultCatalogRepository,
    ResultCommandRepository,
    ResultFoundationRepository,
    ResultGrantRepository,
    ResultPolicyRepository,
    ResultRosterRepository,
    ResultScopeFactsRepository,
    ResultCapabilitiesService,
    ResultCatalogService,
    ResultGrantService,
    ResultPolicyService,
    ResultErrorFilter,
  ],
})
export class OfficialResultsModule {}
