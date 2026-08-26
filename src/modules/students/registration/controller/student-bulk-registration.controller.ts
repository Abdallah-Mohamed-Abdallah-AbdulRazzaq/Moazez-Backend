import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
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
import {
  CreateStudentBulkRegistrationDto,
  StudentBulkRegistrationBatchResponseDto,
  StudentBulkRegistrationPlacementDto,
  StudentBulkRegistrationPreflightResponseDto,
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
