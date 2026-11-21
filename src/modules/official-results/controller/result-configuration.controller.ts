import { UseGuards } from '@nestjs/common';
import { ResultExposureGuard } from '../domain/result-exposure';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseFilters,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { SchoolManagementOnly } from '../../../common/decorators/school-management-only.decorator';
import { ResultCapabilitiesService } from '../application/result-capabilities.service';
import { ResultCatalogService } from '../application/result-catalog.service';
import { ResultGrantService } from '../application/result-grant.service';
import { ResultPolicyService } from '../application/result-policy.service';
import {
  ReportingPeriodCreateDto,
  ReportingPeriodUpdateDto,
  ResultCapabilitiesQueryDto,
  ResultCorrectionWindowDto,
  ResultGrantCreateDto,
  ResultGroupCreateDto,
  ResultGroupsQueryDto,
  ResultGroupUpdateDto,
  ResultPageQueryDto,
  ResultPeriodsQueryDto,
  ResultPolicyActivateDto,
  ResultPolicyPreviewDto,
  ResultReasonedCommandDto,
} from '../dto/result-configuration.dto';
import {
  ResultEndpoint,
  resultContracts,
  resultOpenApiSchema,
} from '../dto/result-openapi.contract';
import { ResultErrorFilter } from './result-error.filter';

@ApiTags('official-results')
@UseGuards(ResultExposureGuard)
@ApiBearerAuth()
@SchoolManagementOnly()
@UseFilters(ResultErrorFilter)
@Controller('official-results')
export class ResultConfigurationController {
  constructor(
    private readonly policy: ResultPolicyService,
    private readonly catalog: ResultCatalogService,
    private readonly grants: ResultGrantService,
    private readonly capabilities: ResultCapabilitiesService,
  ) {}

  @Get('capabilities')
  @ResultEndpoint(
    'getOfficialResultsCapabilities',
    'sheets.view',
    resultContracts.capabilities,
  )
  async getCapabilities(@Query() query: ResultCapabilitiesQueryDto) {
    return { data: await this.capabilities.read('SCHOOL', query) };
  }

  @Get('policy')
  @ResultEndpoint(
    'getOfficialResultsPolicy',
    'policies.view',
    resultContracts.policy,
  )
  async getPolicy() {
    return { data: await this.policy.read() };
  }

  @Get('policy/versions')
  @ResultEndpoint(
    'listOfficialResultsPolicyVersions',
    'policies.view',
    resultContracts.policyVersions,
  )
  async getPolicyVersions(@Query() query: ResultPageQueryDto) {
    return { data: await this.policy.versions(query) };
  }

  @Post('policy/preview')
  @HttpCode(200)
  @ApiBody({
    schema: resultOpenApiSchema(resultContracts.policyPreviewRequest),
  })
  @ResultEndpoint(
    'previewOfficialResultsPolicy',
    'policies.manage',
    resultContracts.policyPreview,
  )
  async previewPolicy(@Body() input: ResultPolicyPreviewDto) {
    return { data: await this.policy.preview(input) };
  }

  @Post('policy/activate')
  @HttpCode(200)
  @ResultEndpoint(
    'activateOfficialResultsPolicy',
    'policies.manage',
    resultContracts.policy,
    200,
    'REQUIRED',
  )
  async activatePolicy(
    @Body() input: ResultPolicyActivateDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.policy.activate(input, key) };
  }

  @Get('periods')
  @ResultEndpoint(
    'listOfficialResultsPeriods',
    'sheets.view',
    resultContracts.periods,
  )
  async listPeriods(@Query() query: ResultPeriodsQueryDto) {
    return { data: await this.catalog.periods('SCHOOL', query) };
  }

  @Post('periods')
  @ResultEndpoint(
    'createOfficialResultsPeriod',
    'periods.manage',
    resultContracts.period,
    201,
    'REQUIRED',
  )
  async createPeriod(
    @Body() input: ReportingPeriodCreateDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.catalog.createPeriod(input, key) };
  }

  @Patch('periods/:id')
  @ResultEndpoint(
    'updateOfficialResultsPeriod',
    'periods.manage',
    resultContracts.period,
    200,
    'OPTIONAL',
  )
  async editPeriod(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ReportingPeriodUpdateDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.catalog.editPeriod(id, input, key) };
  }

  @Post('periods/:id/correction-windows')
  @HttpCode(200)
  @ResultEndpoint(
    'openOfficialResultsArchiveCorrectionWindow',
    'archives.manage',
    resultContracts.period,
    200,
    'REQUIRED',
  )
  async openCorrectionWindow(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ResultCorrectionWindowDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.grants.openCorrectionWindows(id, input, key) };
  }

  @Get('groups')
  @ResultEndpoint(
    'listOfficialResultsGroups',
    'sheets.view',
    resultContracts.groups,
  )
  async listGroups(@Query() query: ResultGroupsQueryDto) {
    return { data: await this.catalog.groups('SCHOOL', query) };
  }

  @Post('groups')
  @ResultEndpoint(
    'createOfficialResultsGroup',
    'groups.manage',
    resultContracts.group,
    201,
    'REQUIRED',
  )
  async createGroup(
    @Body() input: ResultGroupCreateDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.catalog.createGroup(input, key) };
  }

  @Patch('groups/:id')
  @ResultEndpoint(
    'updateOfficialResultsGroup',
    'groups.manage',
    resultContracts.group,
    200,
    'OPTIONAL',
  )
  async editGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ResultGroupUpdateDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.catalog.editGroup(id, input, key) };
  }

  @Get('grants')
  @ResultEndpoint(
    'listOfficialResultsGrants',
    'grants.manage',
    resultContracts.grants,
  )
  async listGrants(@Query() query: ResultPageQueryDto) {
    return { data: await this.grants.list(query) };
  }

  @Post('grants')
  @ResultEndpoint(
    'createOfficialResultsGrant',
    'grants.manage',
    resultContracts.grant,
    201,
    'REQUIRED',
  )
  async createGrant(
    @Body() input: ResultGrantCreateDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.grants.create(input, key) };
  }

  @Post('grants/:id/revoke')
  @HttpCode(200)
  @ResultEndpoint(
    'revokeOfficialResultsGrant',
    'grants.manage',
    resultContracts.grant,
    200,
    'REQUIRED',
  )
  async revokeGrant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ResultReasonedCommandDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.grants.revoke(id, input, key) };
  }
}

@ApiTags('teacher-official-results')
@UseGuards(ResultExposureGuard)
@ApiBearerAuth()
@UseFilters(ResultErrorFilter)
@Controller('teacher/official-results')
export class TeacherResultConfigurationController {
  constructor(
    private readonly catalog: ResultCatalogService,
    private readonly capabilities: ResultCapabilitiesService,
  ) {}

  @Get('capabilities')
  @ResultEndpoint(
    'teacherGetOfficialResultsCapabilities',
    'sheets.view',
    resultContracts.capabilities,
  )
  async getCapabilities(@Query() query: ResultCapabilitiesQueryDto) {
    return { data: await this.capabilities.read('TEACHER', query) };
  }

  @Get('periods')
  @ResultEndpoint(
    'teacherListOfficialResultsPeriods',
    'sheets.view',
    resultContracts.periods,
  )
  async listPeriods(@Query() query: ResultPeriodsQueryDto) {
    return { data: await this.catalog.periods('TEACHER', query) };
  }

  @Get('groups')
  @ResultEndpoint(
    'teacherListOfficialResultsGroups',
    'sheets.view',
    resultContracts.groups,
  )
  async listGroups(@Query() query: ResultGroupsQueryDto) {
    return { data: await this.catalog.groups('TEACHER', query) };
  }
}
