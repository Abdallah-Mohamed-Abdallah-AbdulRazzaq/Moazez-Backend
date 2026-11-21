import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseFilters,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { SchoolManagementOnly } from '../../../common/decorators/school-management-only.decorator';
import { ResultDesignService } from '../application/result-design.service';
import { ResultScopeService } from '../application/result-scope.service';
import { ResultTemplateService } from '../application/result-template.service';
import {
  type AuthoringInput,
  authoringInputs,
  authoringOutputs,
  ResultBodyPipe,
  ResultTemplatesQueryDto,
} from '../dto/result-authoring.dto';
import { ResultPageQueryDto } from '../dto/result-configuration.dto';
import {
  ResultEndpoint,
  resultOpenApiSchema,
} from '../dto/result-openapi.contract';
import { ResultErrorFilter } from './result-error.filter';

@SchoolManagementOnly()
@ApiTags('official-results')
@ApiBearerAuth()
@UseFilters(ResultErrorFilter)
@Controller('official-results')
export class ResultAuthoringController {
  constructor(
    private readonly templates: ResultTemplateService,
    private readonly scopes: ResultScopeService,
    private readonly designs: ResultDesignService,
  ) {}

  @Get('templates')
  @ResultEndpoint(
    'listOfficialResultsTemplates',
    'templates.view',
    authoringOutputs.templates,
  )
  async listTemplates(@Query() query: ResultTemplatesQueryDto) {
    return { data: await this.templates.list('SCHOOL', query) };
  }

  @Post('templates')
  @ApiBody({ schema: resultOpenApiSchema(authoringInputs.template) })
  @ResultEndpoint(
    'createOfficialResultsTemplate',
    'templates.manage',
    authoringOutputs.template,
    201,
    'REQUIRED',
  )
  async createTemplate(
    @Body(new ResultBodyPipe(authoringInputs.template))
    input: AuthoringInput<'template'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.templates.create(input, key) };
  }

  @Post('templates/clone')
  @ApiBody({ schema: resultOpenApiSchema(authoringInputs.clone) })
  @ResultEndpoint(
    'cloneOfficialResultsTemplate',
    'templates.manage',
    authoringOutputs.template,
    201,
    'REQUIRED',
  )
  async cloneTemplate(
    @Body(new ResultBodyPipe(authoringInputs.clone))
    input: AuthoringInput<'clone'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.templates.clone(input, key) };
  }

  @Get('templates/:id')
  @ResultEndpoint(
    'getOfficialResultsTemplate',
    'templates.view',
    authoringOutputs.template,
  )
  async getTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.templates.detail('SCHOOL', id) };
  }

  @Post('templates/:id/versions')
  @ApiBody({ schema: resultOpenApiSchema(authoringInputs.version) })
  @ResultEndpoint(
    'createOfficialResultsTemplateVersion',
    'templates.manage',
    authoringOutputs.templateVersion,
    201,
    'REQUIRED',
  )
  async createTemplateVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(authoringInputs.version))
    input: AuthoringInput<'version'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.templates.createVersion(id, input, key) };
  }

  @Get('templates/:id/versions/:versionId')
  @ResultEndpoint(
    'getOfficialResultsTemplateVersion',
    'templates.view',
    authoringOutputs.templateVersion,
  )
  async getTemplateVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return { data: await this.templates.version('SCHOOL', id, versionId) };
  }

  @Post('templates/:id/activation-preview')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(authoringInputs.activation) })
  @ResultEndpoint(
    'previewOfficialResultsTemplateActivation',
    'templates.manage',
    authoringOutputs.activationPreview,
    200,
  )
  async previewTemplateActivation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(authoringInputs.activation))
    input: AuthoringInput<'activation'>,
  ) {
    return { data: await this.templates.activationPreview(id, input) };
  }

  @Post('templates/:id/activate')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(authoringInputs.activate) })
  @ResultEndpoint(
    'activateOfficialResultsTemplate',
    'templates.manage',
    authoringOutputs.template,
    200,
    'REQUIRED',
  )
  async activateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(authoringInputs.activate))
    input: AuthoringInput<'activate'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.templates.activate(id, input, key) };
  }

  @Post('templates/:id/archive')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(authoringInputs.reason) })
  @ResultEndpoint(
    'archiveOfficialResultsTemplate',
    'templates.manage',
    authoringOutputs.template,
    200,
    'REQUIRED',
  )
  async archiveTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(authoringInputs.reason))
    input: AuthoringInput<'reason'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.templates.archive(id, input, key) };
  }

  @Get('field-presets')
  @ResultEndpoint(
    'listOfficialResultsFieldPresets',
    'templates.view',
    authoringOutputs.presets,
  )
  async listFieldPresets(@Query() query: ResultPageQueryDto) {
    return { data: await this.templates.presets('SCHOOL', query) };
  }

  @Post('scope-assignments')
  @ApiBody({ schema: resultOpenApiSchema(authoringInputs.assignment) })
  @ResultEndpoint(
    'assignOfficialResultsTemplate',
    'scopes.manage',
    authoringOutputs.assignment,
    201,
    'REQUIRED',
  )
  async assignTemplate(
    @Body(new ResultBodyPipe(authoringInputs.assignment))
    input: AuthoringInput<'assignment'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.scopes.assign(input, key) };
  }

  @Get('scope-assignments')
  @ResultEndpoint(
    'listOfficialResultsScopeAssignments',
    'templates.view',
    authoringOutputs.assignments,
  )
  async listScopeAssignments(@Query() query: ResultPageQueryDto) {
    return { data: await this.scopes.list(query) };
  }

  @Post('scope-resolutions')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(authoringInputs.resolution) })
  @ResultEndpoint(
    'resolveOfficialResultsScope',
    'sheets.view',
    authoringOutputs.resolution,
    200,
  )
  async resolveScope(
    @Body(new ResultBodyPipe(authoringInputs.resolution))
    input: AuthoringInput<'resolution'>,
  ) {
    return { data: await this.scopes.resolve('SCHOOL', input) };
  }

  @Post('sheets/materialize')
  @HttpCode(202)
  @ApiBody({ schema: resultOpenApiSchema(authoringInputs.materialization) })
  @ResultEndpoint(
    'materializeOfficialResultsSheets',
    'sheets.create',
    authoringOutputs.operation,
    202,
    'REQUIRED',
  )
  async materializeSheets(
    @Body(new ResultBodyPipe(authoringInputs.materialization))
    input: AuthoringInput<'materialization'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.scopes.materialize('SCHOOL', input, key) };
  }

  @Post('designs')
  @ApiBody({ schema: resultOpenApiSchema(authoringInputs.design) })
  @ResultEndpoint(
    'createOfficialResultsDesign',
    'designs.manage',
    authoringOutputs.design,
    201,
    'REQUIRED',
  )
  async createDesign(
    @Body(new ResultBodyPipe(authoringInputs.design))
    input: AuthoringInput<'design'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.designs.create('SCHOOL', input, key) };
  }

  @Post('sheets/:id/draft-definition-preview')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(authoringInputs.definitionPreview) })
  @ResultEndpoint(
    'previewOfficialResultsDraftDefinition',
    'designs.manage',
    authoringOutputs.definitionPreview,
    200,
  )
  async previewDraftDefinition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(authoringInputs.definitionPreview))
    input: AuthoringInput<'definitionPreview'>,
  ) {
    return { data: await this.designs.preview('SCHOOL', id, input) };
  }

  @Post('sheets/:id/draft-definition-adopt')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(authoringInputs.definitionAdoption) })
  @ResultEndpoint(
    'adoptOfficialResultsDraftDefinition',
    'designs.manage',
    authoringOutputs.sheet,
    200,
    'REQUIRED',
  )
  async adoptDraftDefinition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(authoringInputs.definitionAdoption))
    input: AuthoringInput<'definitionAdoption'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.designs.adopt('SCHOOL', id, input, key) };
  }

  @Post('designs/:id/decisions')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(authoringInputs.designDecision) })
  @ResultEndpoint(
    'decideOfficialResultsDesign',
    'designs.approve',
    authoringOutputs.design,
    200,
    'REQUIRED',
  )
  async decideDesign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(authoringInputs.designDecision))
    input: AuthoringInput<'designDecision'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.designs.decide(id, input, key) };
  }

  @Get('operations/:id')
  @ResultEndpoint(
    'getOfficialResultsOperation',
    'sheets.view',
    authoringOutputs.operation,
  )
  async getOperation(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.scopes.operation('SCHOOL', id) };
  }

  @Get('operations/:id/items')
  @ResultEndpoint(
    'listOfficialResultsOperationItems',
    'sheets.view',
    authoringOutputs.operationItems,
  )
  async listOperationItems(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ResultPageQueryDto,
  ) {
    return { data: await this.scopes.operationItems('SCHOOL', id, query) };
  }
}

@ApiTags('teacher-official-results')
@ApiBearerAuth()
@UseFilters(ResultErrorFilter)
@Controller('teacher/official-results')
export class TeacherResultAuthoringController {
  constructor(
    private readonly templates: ResultTemplateService,
    private readonly scopes: ResultScopeService,
    private readonly designs: ResultDesignService,
  ) {}

  @Get('templates')
  @ResultEndpoint(
    'teacherListOfficialResultsTemplates',
    'templates.view',
    authoringOutputs.templates,
  )
  async listTemplates(@Query() query: ResultTemplatesQueryDto) {
    return { data: await this.templates.list('TEACHER', query) };
  }

  @Get('templates/:id')
  @ResultEndpoint(
    'teacherGetOfficialResultsTemplate',
    'templates.view',
    authoringOutputs.template,
  )
  async getTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.templates.detail('TEACHER', id) };
  }

  @Get('templates/:id/versions/:versionId')
  @ResultEndpoint(
    'teacherGetOfficialResultsTemplateVersion',
    'templates.view',
    authoringOutputs.templateVersion,
  )
  async getTemplateVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return { data: await this.templates.version('TEACHER', id, versionId) };
  }

  @Get('field-presets')
  @ResultEndpoint(
    'teacherListOfficialResultsFieldPresets',
    'templates.view',
    authoringOutputs.presets,
  )
  async listFieldPresets(@Query() query: ResultPageQueryDto) {
    return { data: await this.templates.presets('TEACHER', query) };
  }

  @Post('scope-resolutions')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(authoringInputs.resolution) })
  @ResultEndpoint(
    'teacherResolveOfficialResultsScope',
    'sheets.view',
    authoringOutputs.resolution,
    200,
  )
  async resolveScope(
    @Body(new ResultBodyPipe(authoringInputs.resolution))
    input: AuthoringInput<'resolution'>,
  ) {
    return { data: await this.scopes.resolve('TEACHER', input) };
  }

  @Post('sheets/materialize')
  @HttpCode(202)
  @ApiBody({ schema: resultOpenApiSchema(authoringInputs.materialization) })
  @ResultEndpoint(
    'teacherMaterializeOfficialResultsSheets',
    'sheets.create',
    authoringOutputs.operation,
    202,
    'REQUIRED',
  )
  async materializeSheets(
    @Body(new ResultBodyPipe(authoringInputs.materialization))
    input: AuthoringInput<'materialization'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.scopes.materialize('TEACHER', input, key) };
  }

  @Post('designs')
  @ApiBody({ schema: resultOpenApiSchema(authoringInputs.design) })
  @ResultEndpoint(
    'teacherCreateOfficialResultsDesign',
    'designs.manage',
    authoringOutputs.design,
    201,
    'REQUIRED',
  )
  async createDesign(
    @Body(new ResultBodyPipe(authoringInputs.design))
    input: AuthoringInput<'design'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.designs.create('TEACHER', input, key) };
  }

  @Post('sheets/:id/draft-definition-preview')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(authoringInputs.definitionPreview) })
  @ResultEndpoint(
    'teacherPreviewOfficialResultsDraftDefinition',
    'designs.manage',
    authoringOutputs.definitionPreview,
    200,
  )
  async previewDraftDefinition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(authoringInputs.definitionPreview))
    input: AuthoringInput<'definitionPreview'>,
  ) {
    return { data: await this.designs.preview('TEACHER', id, input) };
  }

  @Post('sheets/:id/draft-definition-adopt')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(authoringInputs.definitionAdoption) })
  @ResultEndpoint(
    'teacherAdoptOfficialResultsDraftDefinition',
    'designs.manage',
    authoringOutputs.sheet,
    200,
    'REQUIRED',
  )
  async adoptDraftDefinition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(authoringInputs.definitionAdoption))
    input: AuthoringInput<'definitionAdoption'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.designs.adopt('TEACHER', id, input, key) };
  }

  @Get('operations/:id')
  @ResultEndpoint(
    'teacherGetOfficialResultsOperation',
    'sheets.view',
    authoringOutputs.operation,
  )
  async getOperation(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.scopes.operation('TEACHER', id) };
  }

  @Get('operations/:id/items')
  @ResultEndpoint(
    'teacherListOfficialResultsOperationItems',
    'sheets.view',
    authoringOutputs.operationItems,
  )
  async listOperationItems(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ResultPageQueryDto,
  ) {
    return { data: await this.scopes.operationItems('TEACHER', id, query) };
  }
}
