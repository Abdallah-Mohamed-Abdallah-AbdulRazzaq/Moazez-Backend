import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UseFilters,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import { SchoolManagementOnly } from '../../../common/decorators/school-management-only.decorator';
import {
  periodReopenPreview,
  reasonedPeriodCommand,
  reopenPeriodCommand,
  ResultPeriodLifecycleService,
  type PeriodPreviewInput,
  type PeriodReopenInput,
  type ReasonedPeriodInput,
  type RevokeResultAccessInput,
  revokeResultAccess,
} from '../application/result-period-lifecycle.service';
import { z } from 'zod/v4';
import { ResultIssueReportService } from '../application/result-issue-report.service';
import { ResultReportsService } from '../application/result-reports.service';
import { ResultBodyPipe, authoringOutputs } from '../dto/result-authoring.dto';
import { exportMedia } from '../dto/result-export.dto';
import {
  ResultEndpoint,
  resultContracts,
  resultOpenApiSchema,
} from '../dto/result-openapi.contract';
import {
  reportOutputs,
  ResultReportsQueryDto,
} from '../dto/result-reports.dto';
import { ResultErrorFilter } from './result-error.filter';

const movedPeriod = resultContracts.period.extend({
  closureSummary: reportOutputs.closureSummary,
});
const revokedAccess = z.object({ id: z.uuid(), revokedAt: z.iso.datetime() });
const fileMedia = {
  ...exportMedia,
  'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
};

@SchoolManagementOnly()
@ApiTags('official-results')
@ApiBearerAuth()
@UseFilters(ResultErrorFilter)
@Controller('official-results')
export class ResultReportsController {
  constructor(
    private readonly reports: ResultReportsService,
    private readonly issues: ResultIssueReportService,
    private readonly periods: ResultPeriodLifecycleService,
  ) {}

  @Get('missing')
  @ResultEndpoint(
    'getOfficialResultsMissingReport',
    'sheets.view',
    reportOutputs.missing,
  )
  async missing(@Query() query: ResultReportsQueryDto) {
    return { data: await this.reports.missing('SCHOOL', query) };
  }

  @Get('history')
  @ResultEndpoint(
    'getOfficialResultsHistory',
    'history.view',
    reportOutputs.history,
  )
  async history(@Query() query: ResultReportsQueryDto) {
    return { data: await this.reports.history('SCHOOL', query) };
  }

  @Post('imports/:id/issue-report')
  @HttpCode(202)
  @ResultEndpoint(
    'exportOfficialResultsImportIssues',
    'imports.view',
    authoringOutputs.operation,
    202,
    'REQUIRED',
  )
  async issueReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.issues.create('SCHOOL', id, key) };
  }

  @Get('files/:fileId/download')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @RequiredPermissions('official_results.sheets.view')
  @ApiOperation({ operationId: 'downloadOfficialResultsPrivateFile' })
  @ApiResponse({ status: 200, content: fileMedia })
  async download(@Param('fileId', ParseUUIDPipe) fileId: string) {
    const content = await this.issues.download('SCHOOL', fileId);
    return new StreamableFile(content.stream, {
      type: content.mediaType,
      length: content.sizeBytes,
      disposition: 'attachment; filename="' + content.filename + '"',
    });
  }

  @Post('periods/:id/close')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(reasonedPeriodCommand) })
  @ResultEndpoint(
    'closeOfficialResultsPeriod',
    'periods.manage',
    movedPeriod,
    200,
    'REQUIRED',
  )
  async close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(reasonedPeriodCommand)) input: ReasonedPeriodInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.periods.move('close', id, input, key) };
  }

  @Post('periods/:id/archive')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(reasonedPeriodCommand) })
  @ResultEndpoint(
    'archiveOfficialResultsPeriod',
    'archives.manage',
    movedPeriod,
    200,
    'REQUIRED',
  )
  async archive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(reasonedPeriodCommand)) input: ReasonedPeriodInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.periods.move('archive', id, input, key) };
  }

  @Post('periods/:id/reopen')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(reopenPeriodCommand) })
  @ResultEndpoint(
    'reopenOfficialResultsPeriod',
    'periods.manage',
    movedPeriod,
    200,
    'REQUIRED',
  )
  async reopen(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(reopenPeriodCommand)) input: PeriodReopenInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.periods.move('reopen', id, input, key) };
  }
  @Post('periods/:id/reopen-preview')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(periodReopenPreview) })
  @ResultEndpoint(
    'previewOfficialResultsPeriodReopen',
    'periods.manage',
    reportOutputs.reopen,
    200,
    undefined,
    ['archives.manage'],
  )
  async reopenPreview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(periodReopenPreview)) input: PeriodPreviewInput,
  ) {
    return { data: await this.periods.preview(id, input) };
  }

  @Post('periods/:id/correction-windows/:windowId/revoke')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(revokeResultAccess) })
  @ResultEndpoint(
    'revokeOfficialResultsCorrectionWindow',
    'archives.manage',
    revokedAccess,
    200,
    'REQUIRED',
  )
  async revokeWindow(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('windowId', ParseUUIDPipe) windowId: string,
    @Body(new ResultBodyPipe(revokeResultAccess))
    input: RevokeResultAccessInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.periods.revokeWindow(id, windowId, input, key) };
  }

  @Post('read-entitlements/:id/revoke')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(revokeResultAccess) })
  @ResultEndpoint(
    'revokeOfficialResultsReadEntitlement',
    'archives.manage',
    revokedAccess,
    200,
    'REQUIRED',
  )
  async revokeEntitlement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(revokeResultAccess))
    input: RevokeResultAccessInput,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.periods.revokeEntitlement(id, input, key) };
  }
}

@ApiTags('teacher-official-results')
@ApiBearerAuth()
@UseFilters(ResultErrorFilter)
@Controller('teacher/official-results')
export class TeacherResultReportsController {
  constructor(
    private readonly reports: ResultReportsService,
    private readonly issues: ResultIssueReportService,
  ) {}

  @Get('missing')
  @ResultEndpoint(
    'teacherGetOfficialResultsMissingReport',
    'sheets.view',
    reportOutputs.missing,
  )
  async missing(@Query() query: ResultReportsQueryDto) {
    return { data: await this.reports.missing('TEACHER', query) };
  }

  @Get('history')
  @ResultEndpoint(
    'teacherGetOfficialResultsHistory',
    'history.view',
    reportOutputs.history,
  )
  async history(@Query() query: ResultReportsQueryDto) {
    return { data: await this.reports.history('TEACHER', query) };
  }

  @Post('imports/:id/issue-report')
  @HttpCode(202)
  @ResultEndpoint(
    'teacherExportOfficialResultsImportIssues',
    'imports.view',
    authoringOutputs.operation,
    202,
    'REQUIRED',
  )
  async issueReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.issues.create('TEACHER', id, key) };
  }

  @Get('files/:fileId/download')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @RequiredPermissions('official_results.sheets.view')
  @ApiOperation({ operationId: 'teacherDownloadOfficialResultsPrivateFile' })
  @ApiResponse({ status: 200, content: fileMedia })
  async download(@Param('fileId', ParseUUIDPipe) fileId: string) {
    const content = await this.issues.download('TEACHER', fileId);
    return new StreamableFile(content.stream, {
      type: content.mediaType,
      length: content.sizeBytes,
      disposition: 'attachment; filename="' + content.filename + '"',
    });
  }
}
