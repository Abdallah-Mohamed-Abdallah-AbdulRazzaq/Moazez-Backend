import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { OrganizationStatus, SchoolStatus } from '@prisma/client';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import { BulkUpdateSchoolFeatureControlsUseCase } from '../application/bulk-update-school-feature-controls.use-case';
import { CreatePlatformOrganizationUseCase } from '../application/create-platform-organization.use-case';
import { CreatePlatformSchoolUseCase } from '../application/create-platform-school.use-case';
import { GetSchoolFeatureControlsUseCase } from '../application/get-school-feature-controls.use-case';
import { GetSchoolEntitlementUseCase } from '../application/get-school-entitlement.use-case';
import { GetPlatformAdminOverviewUseCase } from '../application/get-platform-admin-overview.use-case';
import { GetPlatformOrganizationUseCase } from '../application/get-platform-organization.use-case';
import { GetPlatformSchoolUseCase } from '../application/get-platform-school.use-case';
import { ListPlatformOrganizationsUseCase } from '../application/list-platform-organizations.use-case';
import { ListPlatformSchoolsUseCase } from '../application/list-platform-schools.use-case';
import { ProvisionPlatformSchoolUseCase } from '../application/provision-platform-school.use-case';
import { TransitionPlatformOrganizationStatusUseCase } from '../application/transition-platform-organization-status.use-case';
import { TransitionPlatformSchoolStatusUseCase } from '../application/transition-platform-school-status.use-case';
import { UpdatePlatformOrganizationUseCase } from '../application/update-platform-organization.use-case';
import { UpdatePlatformSchoolUseCase } from '../application/update-platform-school.use-case';
import { UpsertSchoolFeatureControlUseCase } from '../application/upsert-school-feature-control.use-case';
import { UpsertSchoolEntitlementUseCase } from '../application/upsert-school-entitlement.use-case';
import {
  PlatformSchoolEntitlementResponseDto,
  UpsertPlatformSchoolEntitlementDto,
} from '../dto/platform-admin-entitlement.dto';
import {
  BulkUpdatePlatformSchoolFeatureControlsDto,
  PlatformSchoolFeatureControlsResponseDto,
  UpsertPlatformSchoolFeatureControlDto,
} from '../dto/platform-admin-feature-control.dto';
import { PlatformAdminOverviewResponseDto } from '../dto/platform-admin-overview.dto';
import {
  PlatformSchoolProvisioningResponseDto,
  ProvisionPlatformSchoolDto,
} from '../dto/platform-admin-school-provisioning.dto';
import {
  CreatePlatformOrganizationDto,
  ListPlatformOrganizationsQueryDto,
  PlatformOrganizationResponseDto,
  PlatformOrganizationsListResponseDto,
  UpdatePlatformOrganizationDto,
} from '../dto/platform-admin-organization.dto';
import {
  CreatePlatformSchoolDto,
  ListPlatformSchoolsQueryDto,
  PlatformSchoolResponseDto,
  PlatformSchoolsListResponseDto,
  UpdatePlatformSchoolDto,
} from '../dto/platform-admin-school.dto';

@ApiTags('platform-admin')
@ApiBearerAuth()
@Controller('platform-admin')
@PlatformScope()
export class PlatformAdminController {
  constructor(
    private readonly getPlatformAdminOverviewUseCase: GetPlatformAdminOverviewUseCase,
    private readonly listPlatformOrganizationsUseCase: ListPlatformOrganizationsUseCase,
    private readonly getPlatformOrganizationUseCase: GetPlatformOrganizationUseCase,
    private readonly createPlatformOrganizationUseCase: CreatePlatformOrganizationUseCase,
    private readonly updatePlatformOrganizationUseCase: UpdatePlatformOrganizationUseCase,
    private readonly transitionPlatformOrganizationStatusUseCase: TransitionPlatformOrganizationStatusUseCase,
    private readonly listPlatformSchoolsUseCase: ListPlatformSchoolsUseCase,
    private readonly getPlatformSchoolUseCase: GetPlatformSchoolUseCase,
    private readonly createPlatformSchoolUseCase: CreatePlatformSchoolUseCase,
    private readonly updatePlatformSchoolUseCase: UpdatePlatformSchoolUseCase,
    private readonly transitionPlatformSchoolStatusUseCase: TransitionPlatformSchoolStatusUseCase,
    private readonly provisionPlatformSchoolUseCase: ProvisionPlatformSchoolUseCase,
    private readonly getSchoolEntitlementUseCase: GetSchoolEntitlementUseCase,
    private readonly upsertSchoolEntitlementUseCase: UpsertSchoolEntitlementUseCase,
    private readonly getSchoolFeatureControlsUseCase: GetSchoolFeatureControlsUseCase,
    private readonly upsertSchoolFeatureControlUseCase: UpsertSchoolFeatureControlUseCase,
    private readonly bulkUpdateSchoolFeatureControlsUseCase: BulkUpdateSchoolFeatureControlsUseCase,
  ) {}

  @Get('overview')
  @RequiredPermissions('platform.overview.view')
  @ApiOkResponse({ type: PlatformAdminOverviewResponseDto })
  getOverview(): Promise<PlatformAdminOverviewResponseDto> {
    return this.getPlatformAdminOverviewUseCase.execute();
  }

  @Get('organizations')
  @RequiredPermissions('platform.organizations.view')
  @ApiOkResponse({ type: PlatformOrganizationsListResponseDto })
  listOrganizations(
    @Query() query: ListPlatformOrganizationsQueryDto,
  ): Promise<PlatformOrganizationsListResponseDto> {
    return this.listPlatformOrganizationsUseCase.execute(query);
  }

  @Post('organizations')
  @RequiredPermissions('platform.organizations.manage')
  @ApiOkResponse({ type: PlatformOrganizationResponseDto })
  createOrganization(
    @Body() dto: CreatePlatformOrganizationDto,
  ): Promise<PlatformOrganizationResponseDto> {
    return this.createPlatformOrganizationUseCase.execute(dto);
  }

  @Get('organizations/:organizationId')
  @RequiredPermissions('platform.organizations.view')
  @ApiOkResponse({ type: PlatformOrganizationResponseDto })
  getOrganization(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
  ): Promise<PlatformOrganizationResponseDto> {
    return this.getPlatformOrganizationUseCase.execute(organizationId);
  }

  @Patch('organizations/:organizationId')
  @RequiredPermissions('platform.organizations.manage')
  @ApiOkResponse({ type: PlatformOrganizationResponseDto })
  updateOrganization(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Body() dto: UpdatePlatformOrganizationDto,
  ): Promise<PlatformOrganizationResponseDto> {
    return this.updatePlatformOrganizationUseCase.execute(organizationId, dto);
  }

  @Post('organizations/:organizationId/activate')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('platform.organizations.manage')
  @ApiOkResponse({ type: PlatformOrganizationResponseDto })
  activateOrganization(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
  ): Promise<PlatformOrganizationResponseDto> {
    return this.transitionPlatformOrganizationStatusUseCase.execute(
      organizationId,
      OrganizationStatus.ACTIVE,
    );
  }

  @Post('organizations/:organizationId/suspend')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('platform.organizations.manage')
  @ApiOkResponse({ type: PlatformOrganizationResponseDto })
  suspendOrganization(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
  ): Promise<PlatformOrganizationResponseDto> {
    return this.transitionPlatformOrganizationStatusUseCase.execute(
      organizationId,
      OrganizationStatus.SUSPENDED,
    );
  }

  @Post('organizations/:organizationId/archive')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('platform.organizations.manage')
  @ApiOkResponse({ type: PlatformOrganizationResponseDto })
  archiveOrganization(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
  ): Promise<PlatformOrganizationResponseDto> {
    return this.transitionPlatformOrganizationStatusUseCase.execute(
      organizationId,
      OrganizationStatus.ARCHIVED,
    );
  }

  @Get('schools')
  @RequiredPermissions('platform.schools.view')
  @ApiOkResponse({ type: PlatformSchoolsListResponseDto })
  listSchools(
    @Query() query: ListPlatformSchoolsQueryDto,
  ): Promise<PlatformSchoolsListResponseDto> {
    return this.listPlatformSchoolsUseCase.execute(query);
  }

  @Post('organizations/:organizationId/schools')
  @RequiredPermissions('platform.schools.manage')
  @ApiOkResponse({ type: PlatformSchoolResponseDto })
  createSchool(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Body() dto: CreatePlatformSchoolDto,
  ): Promise<PlatformSchoolResponseDto> {
    return this.createPlatformSchoolUseCase.execute(organizationId, dto);
  }

  @Post('school-provisioning')
  @RequiredPermissions('platform.schools.manage')
  @ApiOkResponse({ type: PlatformSchoolProvisioningResponseDto })
  provisionSchool(
    @Body() dto: ProvisionPlatformSchoolDto,
  ): Promise<PlatformSchoolProvisioningResponseDto> {
    return this.provisionPlatformSchoolUseCase.execute(dto);
  }

  @Get('schools/:schoolId')
  @RequiredPermissions('platform.schools.view')
  @ApiOkResponse({ type: PlatformSchoolResponseDto })
  getSchool(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
  ): Promise<PlatformSchoolResponseDto> {
    return this.getPlatformSchoolUseCase.execute(schoolId);
  }

  @Get('schools/:schoolId/entitlement')
  @RequiredPermissions('platform.entitlements.view')
  @ApiOkResponse({ type: PlatformSchoolEntitlementResponseDto })
  getSchoolEntitlement(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
  ): Promise<PlatformSchoolEntitlementResponseDto> {
    return this.getSchoolEntitlementUseCase.execute(schoolId);
  }

  @Put('schools/:schoolId/entitlement')
  @RequiredPermissions('platform.entitlements.manage')
  @ApiOkResponse({ type: PlatformSchoolEntitlementResponseDto })
  upsertSchoolEntitlement(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
    @Body() dto: UpsertPlatformSchoolEntitlementDto,
  ): Promise<PlatformSchoolEntitlementResponseDto> {
    return this.upsertSchoolEntitlementUseCase.execute(schoolId, dto);
  }

  @Get('schools/:schoolId/features')
  @RequiredPermissions('platform.features.view')
  @ApiOkResponse({ type: PlatformSchoolFeatureControlsResponseDto })
  getSchoolFeatureControls(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
  ): Promise<PlatformSchoolFeatureControlsResponseDto> {
    return this.getSchoolFeatureControlsUseCase.execute(schoolId);
  }

  @Put('schools/:schoolId/features')
  @RequiredPermissions('platform.features.manage')
  @ApiOkResponse({ type: PlatformSchoolFeatureControlsResponseDto })
  bulkUpdateSchoolFeatureControls(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
    @Body() dto: BulkUpdatePlatformSchoolFeatureControlsDto,
  ): Promise<PlatformSchoolFeatureControlsResponseDto> {
    return this.bulkUpdateSchoolFeatureControlsUseCase.execute(schoolId, dto);
  }

  @Put('schools/:schoolId/features/:featureKey')
  @RequiredPermissions('platform.features.manage')
  @ApiOkResponse({ type: PlatformSchoolFeatureControlsResponseDto })
  upsertSchoolFeatureControl(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
    @Param('featureKey') featureKey: string,
    @Body() dto: UpsertPlatformSchoolFeatureControlDto,
  ): Promise<PlatformSchoolFeatureControlsResponseDto> {
    return this.upsertSchoolFeatureControlUseCase.execute(
      schoolId,
      featureKey,
      dto,
    );
  }

  @Patch('schools/:schoolId')
  @RequiredPermissions('platform.schools.manage')
  @ApiOkResponse({ type: PlatformSchoolResponseDto })
  updateSchool(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
    @Body() dto: UpdatePlatformSchoolDto,
  ): Promise<PlatformSchoolResponseDto> {
    return this.updatePlatformSchoolUseCase.execute(schoolId, dto);
  }

  @Post('schools/:schoolId/activate')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('platform.schools.manage')
  @ApiOkResponse({ type: PlatformSchoolResponseDto })
  activateSchool(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
  ): Promise<PlatformSchoolResponseDto> {
    return this.transitionPlatformSchoolStatusUseCase.execute(
      schoolId,
      SchoolStatus.ACTIVE,
    );
  }

  @Post('schools/:schoolId/suspend')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('platform.schools.manage')
  @ApiOkResponse({ type: PlatformSchoolResponseDto })
  suspendSchool(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
  ): Promise<PlatformSchoolResponseDto> {
    return this.transitionPlatformSchoolStatusUseCase.execute(
      schoolId,
      SchoolStatus.SUSPENDED,
    );
  }

  @Post('schools/:schoolId/archive')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('platform.schools.manage')
  @ApiOkResponse({ type: PlatformSchoolResponseDto })
  archiveSchool(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
  ): Promise<PlatformSchoolResponseDto> {
    return this.transitionPlatformSchoolStatusUseCase.execute(
      schoolId,
      SchoolStatus.ARCHIVED,
    );
  }
}
