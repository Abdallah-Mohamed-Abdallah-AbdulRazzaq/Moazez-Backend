import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateStudentCredentialBatchUseCase } from '../application/create-student-credential-batch.use-case';
import { GetStudentCredentialBatchUseCase } from '../application/get-student-credential-batch.use-case';
import { PreviewStudentCredentialBatchUseCase } from '../application/preview-student-credential-batch.use-case';
import {
  CreateStudentCredentialBatchDto,
  StudentCredentialAudienceDto,
  StudentCredentialBatchPreviewResponseDto,
  StudentCredentialBatchResponseDto,
} from '../dto/student-credential-batch.dto';

const CREDENTIAL_VIEW_PERMISSIONS = [
  'students.records.view',
  'settings.users.view',
] as const;
const CREDENTIAL_CREATE_PERMISSIONS = [
  'students.records.view',
  'settings.users.manage',
] as const;

@ApiTags('student-credentials')
@ApiBearerAuth()
@Controller('students-guardians/credential-batches')
export class StudentCredentialBatchController {
  constructor(
    private readonly previewUseCase: PreviewStudentCredentialBatchUseCase,
    private readonly createUseCase: CreateStudentCredentialBatchUseCase,
    private readonly getUseCase: GetStudentCredentialBatchUseCase,
  ) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: StudentCredentialBatchPreviewResponseDto })
  @RequiredPermissions(...CREDENTIAL_VIEW_PERMISSIONS)
  preview(
    @Body() dto: StudentCredentialAudienceDto,
  ): Promise<StudentCredentialBatchPreviewResponseDto> {
    return this.previewUseCase.execute(dto);
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: StudentCredentialBatchResponseDto })
  @RequiredPermissions(...CREDENTIAL_CREATE_PERMISSIONS)
  create(
    @Body() dto: CreateStudentCredentialBatchDto,
  ): Promise<StudentCredentialBatchResponseDto> {
    return this.createUseCase.execute(dto);
  }

  @Get(':batchId')
  @ApiOkResponse({ type: StudentCredentialBatchResponseDto })
  @RequiredPermissions(...CREDENTIAL_VIEW_PERMISSIONS)
  get(
    @Param('batchId', ParseUUIDPipe) batchId: string,
  ): Promise<StudentCredentialBatchResponseDto> {
    return this.getUseCase.execute(batchId);
  }
}
