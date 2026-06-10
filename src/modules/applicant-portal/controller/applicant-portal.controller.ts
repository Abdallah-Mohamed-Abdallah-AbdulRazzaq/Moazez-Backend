import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AllowApplicantPortalAccess } from '../../../common/decorators/applicant-portal-access.decorator';
import { PublicRoute } from '../../../common/decorators/public-route.decorator';
import { CreateApplicantAccountUseCase } from '../application/create-applicant-account.use-case';
import { GetDiscoverableSchoolUseCase } from '../application/get-discoverable-school.use-case';
import { GetApplicantProfileUseCase } from '../application/get-applicant-profile.use-case';
import { ListDiscoverableSchoolsUseCase } from '../application/list-discoverable-schools.use-case';
import {
  ApplicantProfileResponseDto,
  CreateApplicantAccountDto,
} from '../dto/applicant-account.dto';
import {
  DiscoverableSchoolResponseDto,
  DiscoverableSchoolsListResponseDto,
  ListDiscoverableSchoolsQueryDto,
} from '../dto/school-discovery.dto';

@ApiTags('applicant-portal')
@Controller('applicant-portal')
export class ApplicantPortalController {
  constructor(
    private readonly createApplicantAccountUseCase: CreateApplicantAccountUseCase,
    private readonly getApplicantProfileUseCase: GetApplicantProfileUseCase,
    private readonly listDiscoverableSchoolsUseCase: ListDiscoverableSchoolsUseCase,
    private readonly getDiscoverableSchoolUseCase: GetDiscoverableSchoolUseCase,
  ) {}

  @Post('accounts')
  @PublicRoute()
  @ApiOperation({
    summary: 'Create a pre-admission applicant account',
  })
  @ApiCreatedResponse({ type: ApplicantProfileResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiConflictResponse({ description: 'iam.user.email_taken' })
  @ApiUnprocessableEntityResponse({
    description: 'iam.credentials.password_policy_failed',
  })
  createAccount(
    @Body() dto: CreateApplicantAccountDto,
    @Req() req: Request,
  ): Promise<ApplicantProfileResponseDto> {
    return this.createApplicantAccountUseCase.execute({
      ...dto,
      ipAddress: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    });
  }

  @Get('schools')
  @PublicRoute()
  @ApiOperation({
    summary: 'List active schools safe for public Applicant Portal discovery',
  })
  @ApiOkResponse({ type: DiscoverableSchoolsListResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  listSchools(
    @Query() query: ListDiscoverableSchoolsQueryDto,
  ): Promise<DiscoverableSchoolsListResponseDto> {
    return this.listDiscoverableSchoolsUseCase.execute(query);
  }

  @Get('schools/:schoolId')
  @PublicRoute()
  @ApiOperation({
    summary:
      'Read active school details safe for public Applicant Portal discovery',
  })
  @ApiParam({ name: 'schoolId', format: 'uuid' })
  @ApiOkResponse({ type: DiscoverableSchoolResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiNotFoundResponse({ description: 'not_found' })
  getSchool(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
  ): Promise<DiscoverableSchoolResponseDto> {
    return this.getDiscoverableSchoolUseCase.execute(schoolId);
  }

  @Get('profile')
  @AllowApplicantPortalAccess()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Read the authenticated applicant profile',
  })
  @ApiOkResponse({ type: ApplicantProfileResponseDto })
  @ApiUnauthorizedResponse({ description: 'auth.token.invalid' })
  @ApiForbiddenResponse({ description: 'auth.scope.missing' })
  @ApiNotFoundResponse({ description: 'not_found' })
  getProfile(): Promise<ApplicantProfileResponseDto> {
    return this.getApplicantProfileUseCase.execute();
  }
}
