import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateApplicationUseCase } from '../application/create-application.use-case';
import { EnrollApplicationHandoffUseCase } from '../application/enroll-application-handoff.use-case';
import { GetApplicationUseCase } from '../application/get-application.use-case';
import { ListApplicationsUseCase } from '../application/list-applications.use-case';
import { SubmitApplicationUseCase } from '../application/submit-application.use-case';
import { UpdateApplicationUseCase } from '../application/update-application.use-case';
import {
  ApplicationEnrollmentHandoffResponseDto,
  ApplicationResponseDto,
  CreateApplicationDto,
  EnrollApplicationHandoffParamsDto,
  ListApplicationsQueryDto,
  UpdateApplicationDto,
} from '../dto/application.dto';

@ApiTags('admissions-applications')
@ApiBearerAuth()
@Controller('admissions/applications')
export class ApplicationsController {
  constructor(
    private readonly listApplicationsUseCase: ListApplicationsUseCase,
    private readonly createApplicationUseCase: CreateApplicationUseCase,
    private readonly getApplicationUseCase: GetApplicationUseCase,
    private readonly updateApplicationUseCase: UpdateApplicationUseCase,
    private readonly submitApplicationUseCase: SubmitApplicationUseCase,
    private readonly enrollApplicationHandoffUseCase: EnrollApplicationHandoffUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: ApplicationResponseDto, isArray: true })
  @RequiredPermissions('admissions.applications.view')
  listApplications(
    @Query() query: ListApplicationsQueryDto,
  ): Promise<ApplicationResponseDto[]> {
    return this.listApplicationsUseCase.execute(query);
  }

  @Post()
  @ApiCreatedResponse({ type: ApplicationResponseDto })
  @RequiredPermissions('admissions.applications.manage')
  createApplication(
    @Body() dto: CreateApplicationDto,
  ): Promise<ApplicationResponseDto> {
    return this.createApplicationUseCase.execute(dto);
  }

  @Get(':id')
  @ApiOkResponse({ type: ApplicationResponseDto })
  @RequiredPermissions('admissions.applications.view')
  getApplication(
    @Param('id', new ParseUUIDPipe()) applicationId: string,
  ): Promise<ApplicationResponseDto> {
    return this.getApplicationUseCase.execute(applicationId);
  }

  @Patch(':id')
  @ApiOkResponse({ type: ApplicationResponseDto })
  @RequiredPermissions('admissions.applications.manage')
  updateApplication(
    @Param('id', new ParseUUIDPipe()) applicationId: string,
    @Body() dto: UpdateApplicationDto,
  ): Promise<ApplicationResponseDto> {
    return this.updateApplicationUseCase.execute(applicationId, dto);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @ApiOkResponse({ type: ApplicationResponseDto })
  @RequiredPermissions('admissions.applications.manage')
  submitApplication(
    @Param('id', new ParseUUIDPipe()) applicationId: string,
  ): Promise<ApplicationResponseDto> {
    return this.submitApplicationUseCase.execute(applicationId);
  }

  @Post(':id/enroll')
  @HttpCode(200)
  @ApiOkResponse({ type: ApplicationEnrollmentHandoffResponseDto })
  @RequiredPermissions('admissions.applications.manage')
  enrollApplication(
    @Param() params: EnrollApplicationHandoffParamsDto,
  ): Promise<ApplicationEnrollmentHandoffResponseDto> {
    return this.enrollApplicationHandoffUseCase.execute(params.id);
  }
}
