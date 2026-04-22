import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateEnrollmentUseCase } from '../application/create-enrollment.use-case';
import { GetCurrentEnrollmentUseCase } from '../application/get-current-enrollment.use-case';
import { GetEnrollmentUseCase } from '../application/get-enrollment.use-case';
import { ListEnrollmentAcademicYearsUseCase } from '../application/list-enrollment-academic-years.use-case';
import { ListEnrollmentHistoryUseCase } from '../application/list-enrollment-history.use-case';
import { ListEnrollmentsUseCase } from '../application/list-enrollments.use-case';
import { UpsertEnrollmentUseCase } from '../application/upsert-enrollment.use-case';
import { ValidateEnrollmentUseCase } from '../application/validate-enrollment.use-case';
import {
  CreateEnrollmentDto,
  CurrentEnrollmentQueryDto,
  EnrollmentAcademicYearResponseDto,
  EnrollmentHistoryQueryDto,
  EnrollmentResponseDto,
  ListEnrollmentsQueryDto,
  UpsertEnrollmentDto,
  ValidateEnrollmentDto,
  ValidateEnrollmentResponseDto,
} from '../dto/enrollment.dto';

@ApiTags('students-enrollments')
@ApiBearerAuth()
@Controller('students-guardians/enrollments')
export class EnrollmentsController {
  constructor(
    private readonly listEnrollmentsUseCase: ListEnrollmentsUseCase,
    private readonly createEnrollmentUseCase: CreateEnrollmentUseCase,
    private readonly upsertEnrollmentUseCase: UpsertEnrollmentUseCase,
    private readonly getEnrollmentUseCase: GetEnrollmentUseCase,
    private readonly getCurrentEnrollmentUseCase: GetCurrentEnrollmentUseCase,
    private readonly listEnrollmentHistoryUseCase: ListEnrollmentHistoryUseCase,
    private readonly listEnrollmentAcademicYearsUseCase: ListEnrollmentAcademicYearsUseCase,
    private readonly validateEnrollmentUseCase: ValidateEnrollmentUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: EnrollmentResponseDto, isArray: true })
  @RequiredPermissions('students.enrollments.view')
  listEnrollments(
    @Query() query: ListEnrollmentsQueryDto,
  ): Promise<EnrollmentResponseDto[]> {
    return this.listEnrollmentsUseCase.execute(query);
  }

  @Get('current')
  @ApiOkResponse({ type: EnrollmentResponseDto, nullable: true })
  @RequiredPermissions('students.enrollments.view')
  getCurrentEnrollment(
    @Query() query: CurrentEnrollmentQueryDto,
  ): Promise<EnrollmentResponseDto | null> {
    return this.getCurrentEnrollmentUseCase.execute(query);
  }

  @Get('history')
  @ApiOkResponse({ type: EnrollmentResponseDto, isArray: true })
  @RequiredPermissions('students.enrollments.view')
  getEnrollmentHistory(
    @Query() query: EnrollmentHistoryQueryDto,
  ): Promise<EnrollmentResponseDto[]> {
    return this.listEnrollmentHistoryUseCase.execute(query);
  }

  @Get('academic-years')
  @ApiOkResponse({ type: EnrollmentAcademicYearResponseDto, isArray: true })
  @RequiredPermissions('students.enrollments.view')
  listAcademicYears(): Promise<EnrollmentAcademicYearResponseDto[]> {
    return this.listEnrollmentAcademicYearsUseCase.execute();
  }

  @Post('validate')
  @HttpCode(200)
  @ApiOkResponse({ type: ValidateEnrollmentResponseDto })
  @RequiredPermissions('students.enrollments.manage')
  validateEnrollment(
    @Body() dto: ValidateEnrollmentDto,
  ): Promise<ValidateEnrollmentResponseDto> {
    return this.validateEnrollmentUseCase.execute(dto);
  }

  @Post()
  @ApiCreatedResponse({ type: EnrollmentResponseDto })
  @RequiredPermissions('students.enrollments.manage')
  createEnrollment(
    @Body() dto: CreateEnrollmentDto,
  ): Promise<EnrollmentResponseDto> {
    return this.createEnrollmentUseCase.execute(dto);
  }

  @Post('upsert')
  @ApiCreatedResponse({ type: EnrollmentResponseDto })
  @RequiredPermissions('students.enrollments.manage')
  upsertEnrollment(
    @Body() dto: UpsertEnrollmentDto,
  ): Promise<EnrollmentResponseDto> {
    return this.upsertEnrollmentUseCase.execute(dto);
  }

  @Get(':enrollmentId')
  @ApiOkResponse({ type: EnrollmentResponseDto })
  @RequiredPermissions('students.enrollments.view')
  getEnrollment(
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
  ): Promise<EnrollmentResponseDto> {
    return this.getEnrollmentUseCase.execute(enrollmentId);
  }
}
