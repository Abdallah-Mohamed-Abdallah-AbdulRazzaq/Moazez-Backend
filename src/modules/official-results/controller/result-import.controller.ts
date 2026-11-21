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
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { z } from 'zod/v4';
import { SchoolManagementOnly } from '../../../common/decorators/school-management-only.decorator';
import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import type { UploadedMultipartFile } from '../../files/uploads/domain/uploaded-file';
import { ResultImportService } from '../application/result-import.service';
import {
  importInputs,
  type ImportInput,
} from '../domain/result-import.contract';
import { platformResultLimits } from '../domain/result-policy';
import { ResultBodyPipe } from '../dto/result-authoring.dto';
import { ResultPageQueryDto } from '../dto/result-configuration.dto';
import { importOutputs } from '../dto/result-import.dto';
import {
  ResultEndpoint,
  resultOpenApiSchema,
} from '../dto/result-openapi.contract';
import { ResultErrorFilter } from './result-error.filter';

const upload = FileInterceptor('file', {
  limits: {
    files: 1,
    fields: 3,
    parts: 4,
    fileSize: platformResultLimits.maxUploadBytes + 1,
    fieldSize: 256 * 1024,
  },
});

const uploadSchema = (replacement: boolean) => ({
  type: 'object',
  required: [
    'exportId',
    'file',
    ...(replacement ? ['expectedBatchRevision'] : []),
  ],
  properties: {
    exportId: { type: 'string', format: 'uuid' },
    file: { type: 'string', format: 'binary' },
    validateOptions: {
      type: 'string',
      description:
        'JSON-encoded validation options with optional clearReason, reasons and selectedSheetIds',
    },
    ...(replacement
      ? { expectedBatchRevision: { type: 'integer', minimum: 1 } }
      : {}),
  },
});

function readUpload(body: Record<string, unknown>): ImportInput<'intake'> {
  try {
    const validateOptions =
      typeof body.validateOptions === 'string'
        ? JSON.parse(body.validateOptions)
        : body.validateOptions;
    const revision = body.expectedBatchRevision;
    const expectedBatchRevision =
      typeof revision === 'string' && /^[1-9][0-9]{0,9}$/u.test(revision)
        ? Number(revision)
        : revision;
    return importInputs.intake.parse({
      ...body,
      validateOptions,
      expectedBatchRevision,
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      throw new ValidationDomainException(
        'Invalid result import multipart fields',
      );
    throw error;
  }
}

@SchoolManagementOnly()
@ApiTags('official-results')
@ApiBearerAuth()
@UseFilters(ResultErrorFilter)
@Controller('official-results')
export class ResultImportController {
  constructor(private readonly imports: ResultImportService) {}

  @Post('imports')
  @HttpCode(202)
  @UseInterceptors(upload)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: uploadSchema(false) })
  @ResultEndpoint(
    'createOfficialResultsImport',
    'imports.manage',
    importOutputs.batch,
    202,
    'REQUIRED',
  )
  async create(
    @Body() body: Record<string, unknown>,
    @UploadedFile() file: UploadedMultipartFile | undefined,
    @Headers('idempotency-key') key?: string,
  ) {
    return {
      data: await this.imports.upload('SCHOOL', readUpload(body), file, key),
    };
  }

  @Post('imports/:id/source-versions')
  @HttpCode(202)
  @UseInterceptors(upload)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: uploadSchema(true) })
  @ResultEndpoint(
    'replaceOfficialResultsImportSource',
    'imports.manage',
    importOutputs.batch,
    202,
    'REQUIRED',
  )
  async replace(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile() file: UploadedMultipartFile | undefined,
    @Headers('idempotency-key') key?: string,
  ) {
    return {
      data: await this.imports.upload(
        'SCHOOL',
        readUpload(body),
        file,
        key,
        id,
      ),
    };
  }

  @Get('imports')
  @ResultEndpoint(
    'listOfficialResultsImports',
    'imports.view',
    importOutputs.list,
  )
  async list(@Query() query: ResultPageQueryDto) {
    return { data: await this.imports.list('SCHOOL', query) };
  }

  @Get('imports/:id')
  @ResultEndpoint(
    'getOfficialResultsImport',
    'imports.view',
    importOutputs.batch,
  )
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.imports.detail('SCHOOL', id) };
  }

  @Get('imports/:id/issues')
  @ResultEndpoint(
    'listOfficialResultsImportIssues',
    'imports.view',
    importOutputs.issues,
  )
  async issues(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ResultPageQueryDto,
  ) {
    return { data: await this.imports.report('SCHOOL', id, 'issues', query) };
  }

  @Get('imports/:id/changes')
  @ResultEndpoint(
    'listOfficialResultsImportChanges',
    'imports.view',
    importOutputs.changes,
  )
  async changes(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ResultPageQueryDto,
  ) {
    return { data: await this.imports.report('SCHOOL', id, 'changes', query) };
  }

  @Get('imports/:id/rows')
  @ResultEndpoint(
    'listOfficialResultsImportRows',
    'imports.view',
    importOutputs.rows,
  )
  async rows(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ResultPageQueryDto,
  ) {
    return { data: await this.imports.report('SCHOOL', id, 'rows', query) };
  }

  @Post('imports/:id/corrections')
  @HttpCode(202)
  @ApiBody({ schema: resultOpenApiSchema(importInputs.correct) })
  @ResultEndpoint(
    'correctOfficialResultsImport',
    'imports.manage',
    importOutputs.batch,
    202,
    'REQUIRED',
  )
  async correct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(importInputs.correct))
    input: ImportInput<'correct'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.imports.correct('SCHOOL', id, input, key) };
  }

  @Post('imports/:id/revalidate')
  @HttpCode(202)
  @ApiBody({ schema: resultOpenApiSchema(importInputs.revalidate) })
  @ResultEndpoint(
    'revalidateOfficialResultsImport',
    'imports.manage',
    importOutputs.batch,
    202,
    'REQUIRED',
  )
  async revalidate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(importInputs.revalidate))
    input: ImportInput<'revalidate'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.imports.revalidate('SCHOOL', id, input, key) };
  }
}

@ApiTags('teacher-official-results')
@ApiBearerAuth()
@UseFilters(ResultErrorFilter)
@Controller('teacher/official-results')
export class TeacherResultImportController {
  constructor(private readonly imports: ResultImportService) {}

  @Post('imports')
  @HttpCode(202)
  @UseInterceptors(upload)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: uploadSchema(false) })
  @ResultEndpoint(
    'teacherCreateOfficialResultsImport',
    'imports.manage',
    importOutputs.batch,
    202,
    'REQUIRED',
  )
  async create(
    @Body() body: Record<string, unknown>,
    @UploadedFile() file: UploadedMultipartFile | undefined,
    @Headers('idempotency-key') key?: string,
  ) {
    return {
      data: await this.imports.upload('TEACHER', readUpload(body), file, key),
    };
  }

  @Post('imports/:id/source-versions')
  @HttpCode(202)
  @UseInterceptors(upload)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: uploadSchema(true) })
  @ResultEndpoint(
    'teacherReplaceOfficialResultsImportSource',
    'imports.manage',
    importOutputs.batch,
    202,
    'REQUIRED',
  )
  async replace(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile() file: UploadedMultipartFile | undefined,
    @Headers('idempotency-key') key?: string,
  ) {
    return {
      data: await this.imports.upload(
        'TEACHER',
        readUpload(body),
        file,
        key,
        id,
      ),
    };
  }

  @Get('imports')
  @ResultEndpoint(
    'teacherListOfficialResultsImports',
    'imports.view',
    importOutputs.list,
  )
  async list(@Query() query: ResultPageQueryDto) {
    return { data: await this.imports.list('TEACHER', query) };
  }

  @Get('imports/:id')
  @ResultEndpoint(
    'teacherGetOfficialResultsImport',
    'imports.view',
    importOutputs.batch,
  )
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.imports.detail('TEACHER', id) };
  }

  @Get('imports/:id/issues')
  @ResultEndpoint(
    'teacherListOfficialResultsImportIssues',
    'imports.view',
    importOutputs.issues,
  )
  async issues(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ResultPageQueryDto,
  ) {
    return { data: await this.imports.report('TEACHER', id, 'issues', query) };
  }

  @Get('imports/:id/changes')
  @ResultEndpoint(
    'teacherListOfficialResultsImportChanges',
    'imports.view',
    importOutputs.changes,
  )
  async changes(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ResultPageQueryDto,
  ) {
    return { data: await this.imports.report('TEACHER', id, 'changes', query) };
  }

  @Get('imports/:id/rows')
  @ResultEndpoint(
    'teacherListOfficialResultsImportRows',
    'imports.view',
    importOutputs.rows,
  )
  async rows(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ResultPageQueryDto,
  ) {
    return { data: await this.imports.report('TEACHER', id, 'rows', query) };
  }

  @Post('imports/:id/corrections')
  @HttpCode(202)
  @ApiBody({ schema: resultOpenApiSchema(importInputs.correct) })
  @ResultEndpoint(
    'teacherCorrectOfficialResultsImport',
    'imports.manage',
    importOutputs.batch,
    202,
    'REQUIRED',
  )
  async correct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(importInputs.correct))
    input: ImportInput<'correct'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.imports.correct('TEACHER', id, input, key) };
  }

  @Post('imports/:id/revalidate')
  @HttpCode(202)
  @ApiBody({ schema: resultOpenApiSchema(importInputs.revalidate) })
  @ResultEndpoint(
    'teacherRevalidateOfficialResultsImport',
    'imports.manage',
    importOutputs.batch,
    202,
    'REQUIRED',
  )
  async revalidate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ResultBodyPipe(importInputs.revalidate))
    input: ImportInput<'revalidate'>,
    @Headers('idempotency-key') key?: string,
  ) {
    return { data: await this.imports.revalidate('TEACHER', id, input, key) };
  }
}
