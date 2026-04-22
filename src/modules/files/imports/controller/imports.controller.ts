import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateImportJobUseCase } from '../application/create-import-job.use-case';
import { GetImportJobUseCase } from '../application/get-import-job.use-case';
import { GetImportReportUseCase } from '../application/get-import-report.use-case';
import {
  CreateImportJobRequestDto,
  ImportJobReportResponseDto,
  ImportJobStatusResponseDto,
} from '../dto/create-import-job.dto';
import { UploadedMultipartFile } from '../../uploads/domain/uploaded-file';

@ApiTags('files-imports')
@ApiBearerAuth()
@Controller('files/imports')
export class ImportsController {
  constructor(
    private readonly createImportJobUseCase: CreateImportJobUseCase,
    private readonly getImportJobUseCase: GetImportJobUseCase,
    private readonly getImportReportUseCase: GetImportReportUseCase,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateImportJobRequestDto })
  @ApiCreatedResponse({ type: ImportJobStatusResponseDto })
  @RequiredPermissions('files.imports.manage')
  createImportJob(
    @Body() dto: CreateImportJobRequestDto,
    @UploadedFile() file: UploadedMultipartFile | undefined,
  ): Promise<ImportJobStatusResponseDto> {
    return this.createImportJobUseCase.execute(dto, file);
  }

  @Get(':id/report')
  @ApiOkResponse({ type: ImportJobReportResponseDto })
  @RequiredPermissions('files.imports.view')
  getImportReport(
    @Param('id', new ParseUUIDPipe()) importJobId: string,
  ): Promise<ImportJobReportResponseDto> {
    return this.getImportReportUseCase.execute(importJobId);
  }

  @Get(':id')
  @ApiOkResponse({ type: ImportJobStatusResponseDto })
  @RequiredPermissions('files.imports.view')
  getImportJob(
    @Param('id', new ParseUUIDPipe()) importJobId: string,
  ): Promise<ImportJobStatusResponseDto> {
    return this.getImportJobUseCase.execute(importJobId);
  }
}
