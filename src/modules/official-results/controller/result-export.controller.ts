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
import { ResultExportService } from '../application/result-export.service';
import {
  exportCreate,
  exportRequest,
  type ExportCreate,
  type ExportRequest,
} from '../domain/result-export.contract';
import { ResultBodyPipe } from '../dto/result-authoring.dto';
import { ResultPageQueryDto } from '../dto/result-configuration.dto';
import { exportOutputs, exportMedia } from '../dto/result-export.dto';
import {
  ResultEndpoint,
  resultOpenApiSchema,
} from '../dto/result-openapi.contract';
import { ResultErrorFilter } from './result-error.filter';

function downloadFile(
  result: Awaited<ReturnType<ResultExportService['download']>>,
) {
  return new StreamableFile(result.stream, {
    type: result.mediaType,
    length: result.sizeBytes,
    disposition: 'attachment; filename="' + result.filename + '"',
  });
}

@SchoolManagementOnly()
@ApiTags('official-results')
@ApiBearerAuth()
@UseFilters(ResultErrorFilter)
@Controller('official-results')
export class ResultExportController {
  constructor(private readonly exports: ResultExportService) {}

  @Post('exports/preview')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(exportRequest) })
  @ResultEndpoint(
    'previewOfficialResultsExport',
    'exports.create',
    exportOutputs.preview,
  )
  async preview(@Body(new ResultBodyPipe(exportRequest)) input: ExportRequest) {
    return { data: await this.exports.preview('SCHOOL', input) };
  }

  @Post('exports')
  @HttpCode(202)
  @ApiBody({ schema: resultOpenApiSchema(exportCreate) })
  @ResultEndpoint(
    'createOfficialResultsExport',
    'exports.create',
    exportOutputs.export,
    202,
    'REQUIRED',
  )
  async create(
    @Body(new ResultBodyPipe(exportCreate)) input: ExportCreate,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.exports.create('SCHOOL', input, key) };
  }

  @Get('exports')
  @ResultEndpoint(
    'listOfficialResultsExports',
    'exports.create',
    exportOutputs.list,
  )
  async list(@Query() query: ResultPageQueryDto) {
    return { data: await this.exports.list('SCHOOL', query) };
  }

  @Get('exports/:id')
  @ResultEndpoint(
    'getOfficialResultsExport',
    'exports.create',
    exportOutputs.export,
  )
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.exports.detail('SCHOOL', id) };
  }

  @Get('exports/:id/files/:fileId/download')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @RequiredPermissions('official_results.exports.create')
  @ApiOperation({ operationId: 'downloadOfficialResultsExport' })
  @ApiResponse({ status: 200, content: exportMedia })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return downloadFile(await this.exports.download('SCHOOL', id, fileId));
  }
}

@ApiTags('teacher-official-results')
@ApiBearerAuth()
@UseFilters(ResultErrorFilter)
@Controller('teacher/official-results')
export class TeacherResultExportController {
  constructor(private readonly exports: ResultExportService) {}

  @Post('exports/preview')
  @HttpCode(200)
  @ApiBody({ schema: resultOpenApiSchema(exportRequest) })
  @ResultEndpoint(
    'teacherPreviewOfficialResultsExport',
    'exports.create',
    exportOutputs.preview,
  )
  async preview(@Body(new ResultBodyPipe(exportRequest)) input: ExportRequest) {
    return { data: await this.exports.preview('TEACHER', input) };
  }

  @Post('exports')
  @HttpCode(202)
  @ApiBody({ schema: resultOpenApiSchema(exportCreate) })
  @ResultEndpoint(
    'teacherCreateOfficialResultsExport',
    'exports.create',
    exportOutputs.export,
    202,
    'REQUIRED',
  )
  async create(
    @Body(new ResultBodyPipe(exportCreate)) input: ExportCreate,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.exports.create('TEACHER', input, key) };
  }

  @Get('exports')
  @ResultEndpoint(
    'teacherListOfficialResultsExports',
    'exports.create',
    exportOutputs.list,
  )
  async list(@Query() query: ResultPageQueryDto) {
    return { data: await this.exports.list('TEACHER', query) };
  }

  @Get('exports/:id')
  @ResultEndpoint(
    'teacherGetOfficialResultsExport',
    'exports.create',
    exportOutputs.export,
  )
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.exports.detail('TEACHER', id) };
  }

  @Get('exports/:id/files/:fileId/download')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @RequiredPermissions('official_results.exports.create')
  @ApiOperation({ operationId: 'teacherDownloadOfficialResultsExport' })
  @ApiResponse({ status: 200, content: exportMedia })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return downloadFile(await this.exports.download('TEACHER', id, fileId));
  }
}
