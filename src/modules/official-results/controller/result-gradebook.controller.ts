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
import { ResultGradebookService } from '../application/result-gradebook.service';
import { ResultRosterReconcileService } from '../application/result-roster-reconcile.service';
import type { ResultGridPatch } from '../domain/result-cell-operation';
import type {
  RosterPreviewInput,
  RosterReconcileInput,
} from '../domain/result-roster-contract';
import { ResultBodyPipe } from '../dto/result-authoring.dto';
import {
  gradebookInputs,
  gradebookOutputs,
  ResultGridQueryDto,
  ResultSheetsQueryDto,
} from '../dto/result-gradebook.dto';
import {
  ResultEndpoint,
  resultOpenApiSchema,
} from '../dto/result-openapi.contract';
import { ResultErrorFilter } from './result-error.filter';

@ApiTags('official-results')
@UseGuards(ResultExposureGuard)
@ApiBearerAuth()
@SchoolManagementOnly()
@UseFilters(ResultErrorFilter)
@Controller('official-results')
export class ResultGradebookController {
  constructor(
    private readonly gradebook: ResultGradebookService,
    private readonly roster: ResultRosterReconcileService,
  ) {}

  @Get('sheets')
  @ResultEndpoint(
    'listOfficialResultsSheets',
    'sheets.view',
    gradebookOutputs.sheets,
  )
  async list(@Query() query: ResultSheetsQueryDto) {
    return { data: await this.gradebook.list('SCHOOL', query) };
  }

  @Get('sheets/:id')
  @ResultEndpoint(
    'getOfficialResultsSheet',
    'sheets.view',
    gradebookOutputs.sheet,
  )
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.gradebook.detail('SCHOOL', id) };
  }

  @Get('sheets/:id/grid')
  @ResultEndpoint(
    'getOfficialResultsGrid',
    'sheets.view',
    gradebookOutputs.grid,
  )
  async grid(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ResultGridQueryDto,
  ) {
    return { data: await this.gradebook.grid('SCHOOL', id, query) };
  }

  @Patch('sheets/:id/cells')
  @ApiBody({ schema: resultOpenApiSchema(gradebookInputs.patch) })
  @ResultEndpoint(
    'patchOfficialResultsCells',
    'entries.manage',
    gradebookOutputs.patch,
    200,
    'OPTIONAL',
  )
  async patch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(gradebookInputs.patch)) input: ResultGridPatch,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.gradebook.patch('SCHOOL', id, input, key) };
  }

  @Post('sheets/:id/roster-preview')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(gradebookInputs.rosterPreview) })
  @ResultEndpoint(
    'previewOfficialResultsRosterReconciliation',
    'rosters.manage',
    gradebookOutputs.rosterPreview,
  )
  async rosterPreview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(gradebookInputs.rosterPreview))
    input: RosterPreviewInput,
  ) {
    return { data: await this.roster.preview(id, input) };
  }

  @Post('sheets/:id/roster-reconcile')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(gradebookInputs.rosterReconcile) })
  @ResultEndpoint(
    'reconcileOfficialResultsRoster',
    'rosters.manage',
    gradebookOutputs.roster,
    200,
    'REQUIRED',
  )
  async reconcileRoster(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(gradebookInputs.rosterReconcile))
    input: RosterReconcileInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.roster.reconcile(id, input, key) };
  }
}

@ApiTags('teacher-official-results')
@UseGuards(ResultExposureGuard)
@ApiBearerAuth()
@UseFilters(ResultErrorFilter)
@Controller('teacher/official-results')
export class TeacherResultGradebookController {
  constructor(private readonly gradebook: ResultGradebookService) {}

  @Get('sheets')
  @ResultEndpoint(
    'teacherListOfficialResultsSheets',
    'sheets.view',
    gradebookOutputs.sheets,
  )
  async list(@Query() query: ResultSheetsQueryDto) {
    return { data: await this.gradebook.list('TEACHER', query) };
  }

  @Get('sheets/:id')
  @ResultEndpoint(
    'teacherGetOfficialResultsSheet',
    'sheets.view',
    gradebookOutputs.sheet,
  )
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.gradebook.detail('TEACHER', id) };
  }

  @Get('sheets/:id/grid')
  @ResultEndpoint(
    'teacherGetOfficialResultsGrid',
    'sheets.view',
    gradebookOutputs.grid,
  )
  async grid(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ResultGridQueryDto,
  ) {
    return { data: await this.gradebook.grid('TEACHER', id, query) };
  }

  @Patch('sheets/:id/cells')
  @ApiBody({ schema: resultOpenApiSchema(gradebookInputs.patch) })
  @ResultEndpoint(
    'teacherPatchOfficialResultsCells',
    'entries.manage',
    gradebookOutputs.patch,
    200,
    'OPTIONAL',
  )
  async patch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(gradebookInputs.patch)) input: ResultGridPatch,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.gradebook.patch('TEACHER', id, input, key) };
  }
}
