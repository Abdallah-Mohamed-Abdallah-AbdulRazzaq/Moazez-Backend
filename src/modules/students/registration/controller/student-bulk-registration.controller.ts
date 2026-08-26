import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Param,
  ParseUUIDPipe,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiAcceptedResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import type { UploadedMultipartFile } from '../../../files/uploads/domain/uploaded-file';
import { CreateStudentBulkRegistrationUseCase } from '../application/create-student-bulk-registration.use-case';
import { GetStudentBulkRegistrationTemplateUseCase } from '../application/get-student-bulk-registration-template.use-case';
import { StudentBulkRegistrationPreflightUseCase } from '../application/student-bulk-registration-preflight.use-case';
import { GetStudentBulkRegistrationBatchUseCase } from '../application/get-student-bulk-registration-batch.use-case';
import { ListStudentBulkRegistrationRowsUseCase } from '../application/list-student-bulk-registration-rows.use-case';
import { ConfirmStudentBulkRegistrationUseCase } from '../application/confirm-student-bulk-registration.use-case';
import {
  CreateStudentBulkRegistrationDto,
  StudentBulkRegistrationBatchResponseDto,
  StudentBulkRegistrationPlacementDto,
  StudentBulkRegistrationPreflightResponseDto,
  ListStudentBulkRegistrationRowsQueryDto,
  StudentBulkRegistrationBatchDetailResponseDto,
  StudentBulkRegistrationRowsResponseDto,
} from '../dto/student-bulk-registration.dto';
import { STUDENT_BULK_REGISTRATION_TEMPLATE_FILENAME } from '../domain/student-bulk-registration.constants';

const BULK_REGISTRATION_PERMISSIONS = [
  'students.records.manage',
  'students.enrollments.manage',
] as const;

@ApiTags('students-registration')
@ApiBearerAuth()
@Controller('students-guardians/bulk-registrations')
export class StudentBulkRegistrationController {
  constructor(
    private readonly preflightUseCase: StudentBulkRegistrationPreflightUseCase,
    private readonly templateUseCase: GetStudentBulkRegistrationTemplateUseCase,
    private readonly createUseCase: CreateStudentBulkRegistrationUseCase,
    private readonly getBatchUseCase: GetStudentBulkRegistrationBatchUseCase,
    private readonly listRowsUseCase: ListStudentBulkRegistrationRowsUseCase,
    private readonly confirmUseCase: ConfirmStudentBulkRegistrationUseCase,
  ) {}

  @Post('preflight')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: StudentBulkRegistrationPreflightResponseDto })
  @RequiredPermissions(...BULK_REGISTRATION_PERMISSIONS)
  preflight(
    @Body() dto: StudentBulkRegistrationPlacementDto,
  ): Promise<StudentBulkRegistrationPreflightResponseDto> {
    return this.preflightUseCase.execute(dto);
  }

  @Get('template')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    `attachment; filename="${STUDENT_BULK_REGISTRATION_TEMPLATE_FILENAME}"`,
  )
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'Header-only student bulk registration CSV' })
  @RequiredPermissions(...BULK_REGISTRATION_PERMISSIONS)
  getTemplate(): string {
    return this.templateUseCase.execute();
  }

  @Get(':batchId/rows')
  @ApiOkResponse({ type: StudentBulkRegistrationRowsResponseDto })
  @RequiredPermissions(...BULK_REGISTRATION_PERMISSIONS)
  listRows(
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @Query() query: ListStudentBulkRegistrationRowsQueryDto,
  ): Promise<StudentBulkRegistrationRowsResponseDto> {
    return this.listRowsUseCase.execute(batchId, query);
  }

  @Get(':batchId')
  @ApiOkResponse({ type: StudentBulkRegistrationBatchDetailResponseDto })
  @RequiredPermissions(...BULK_REGISTRATION_PERMISSIONS)
  getBatch(
    @Param('batchId', ParseUUIDPipe) batchId: string,
  ): Promise<StudentBulkRegistrationBatchDetailResponseDto> {
    return this.getBatchUseCase.execute(batchId);
  }

  @Post(':batchId/confirm')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: StudentBulkRegistrationBatchDetailResponseDto })
  @RequiredPermissions(...BULK_REGISTRATION_PERMISSIONS)
  confirm(
    @Param('batchId', ParseUUIDPipe) batchId: string,
  ): Promise<StudentBulkRegistrationBatchDetailResponseDto> {
    return this.confirmUseCase.execute(batchId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateStudentBulkRegistrationDto })
  @ApiCreatedResponse({ type: StudentBulkRegistrationBatchResponseDto })
  @RequiredPermissions(...BULK_REGISTRATION_PERMISSIONS)
  create(
    @Body() dto: CreateStudentBulkRegistrationDto,
    @UploadedFile() file: UploadedMultipartFile | undefined,
  ): Promise<StudentBulkRegistrationBatchResponseDto> {
    return this.createUseCase.execute(dto, file);
  }
}
