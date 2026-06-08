import { Module } from '@nestjs/common';
import { AuthModule } from '../iam/auth/auth.module';
import { CreatePlatformOrganizationUseCase } from './application/create-platform-organization.use-case';
import { CreatePlatformSchoolUseCase } from './application/create-platform-school.use-case';
import { GetSchoolEntitlementUseCase } from './application/get-school-entitlement.use-case';
import { GetPlatformAdminOverviewUseCase } from './application/get-platform-admin-overview.use-case';
import { GetPlatformOrganizationUseCase } from './application/get-platform-organization.use-case';
import { GetPlatformSchoolUseCase } from './application/get-platform-school.use-case';
import { ListPlatformOrganizationsUseCase } from './application/list-platform-organizations.use-case';
import { ListPlatformSchoolsUseCase } from './application/list-platform-schools.use-case';
import { ProvisionPlatformSchoolUseCase } from './application/provision-platform-school.use-case';
import { TransitionPlatformOrganizationStatusUseCase } from './application/transition-platform-organization-status.use-case';
import { TransitionPlatformSchoolStatusUseCase } from './application/transition-platform-school-status.use-case';
import { UpdatePlatformOrganizationUseCase } from './application/update-platform-organization.use-case';
import { UpdatePlatformSchoolUseCase } from './application/update-platform-school.use-case';
import { UpsertSchoolEntitlementUseCase } from './application/upsert-school-entitlement.use-case';
import { PlatformAdminController } from './controller/platform-admin.controller';
import { PlatformAdminEntitlementsRepository } from './infrastructure/platform-admin-entitlements.repository';
import { PlatformAdminRepository } from './infrastructure/platform-admin.repository';

@Module({
  imports: [AuthModule],
  controllers: [PlatformAdminController],
  providers: [
    PlatformAdminRepository,
    PlatformAdminEntitlementsRepository,
    GetPlatformAdminOverviewUseCase,
    ListPlatformOrganizationsUseCase,
    GetPlatformOrganizationUseCase,
    CreatePlatformOrganizationUseCase,
    UpdatePlatformOrganizationUseCase,
    TransitionPlatformOrganizationStatusUseCase,
    ListPlatformSchoolsUseCase,
    GetPlatformSchoolUseCase,
    CreatePlatformSchoolUseCase,
    UpdatePlatformSchoolUseCase,
    TransitionPlatformSchoolStatusUseCase,
    ProvisionPlatformSchoolUseCase,
    GetSchoolEntitlementUseCase,
    UpsertSchoolEntitlementUseCase,
  ],
})
export class PlatformAdminModule {}
