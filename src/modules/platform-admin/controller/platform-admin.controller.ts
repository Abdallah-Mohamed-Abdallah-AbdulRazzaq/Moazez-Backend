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
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { OrganizationStatus, SchoolStatus } from '@prisma/client';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import { CreatePlatformOrganizationUseCase } from '../application/create-platform-organization.use-case';
import { CreatePlatformSchoolUseCase } from '../application/create-platform-school.use-case';
import { GetPlatformAdminOverviewUseCase } from '../application/get-platform-admin-overview.use-case';
import { GetPlatformOrganizationUseCase } from '../application/get-platform-organization.use-case';
import { GetPlatformSchoolUseCase } from '../application/get-platform-school.use-case';
import { ListPlatformOrganizationsUseCase } from '../application/list-platform-organizations.use-case';
import { ListPlatformSchoolsUseCase } from '../application/list-platform-schools.use-case';
import { TransitionPlatformOrganizationStatusUseCase } from '../application/transition-platform-organization-status.use-case';
import { TransitionPlatformSchoolStatusUseCase } from '../application/transition-platform-school-status.use-case';
import { UpdatePlatformOrganizationUseCase } from '../application/update-platform-organization.use-case';
import { UpdatePlatformSchoolUseCase } from '../application/update-platform-school.use-case';
import { PlatformAdminOverviewResponseDto } from '../dto/platform-admin-overview.dto';
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

  @Get('schools/:schoolId')
  @RequiredPermissions('platform.schools.view')
  @ApiOkResponse({ type: PlatformSchoolResponseDto })
  getSchool(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
  ): Promise<PlatformSchoolResponseDto> {
    return this.getPlatformSchoolUseCase.execute(schoolId);
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
