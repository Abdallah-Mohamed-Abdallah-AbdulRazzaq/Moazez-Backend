import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Redirect,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTemporaryRedirectResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { AllowApplicantPortalAccess } from '../../../common/decorators/applicant-portal-access.decorator';
import { PublicRoute } from '../../../common/decorators/public-route.decorator';
import { CreateApplicantAccountUseCase } from '../application/create-applicant-account.use-case';
import { CreateApplicantRequestUseCase } from '../application/create-applicant-request.use-case';
import { DeleteApplicantDocumentUseCase } from '../application/delete-applicant-document.use-case';
import { GetApplicantDocumentDownloadUrlUseCase } from '../application/get-applicant-document-download-url.use-case';
import { GetApplicantDocumentUseCase } from '../application/get-applicant-document.use-case';
import { GetDiscoverableSchoolUseCase } from '../application/get-discoverable-school.use-case';
import { GetApplicantRequestUseCase } from '../application/get-applicant-request.use-case';
import { GetApplicantProfileUseCase } from '../application/get-applicant-profile.use-case';
import { ListAdmissionRequiredDocumentsUseCase } from '../application/list-admission-required-documents.use-case';
import { ListApplicantDocumentsUseCase } from '../application/list-applicant-documents.use-case';
import { ListApplicantRequestsUseCase } from '../application/list-applicant-requests.use-case';
import { ListDiscoverableSchoolsUseCase } from '../application/list-discoverable-schools.use-case';
import { ReplaceApplicantDocumentUseCase } from '../application/replace-applicant-document.use-case';
import { SubmitApplicantRequestUseCase } from '../application/submit-applicant-request.use-case';
import { UploadApplicantDocumentUseCase } from '../application/upload-applicant-document.use-case';
import { AdmissionRequiredDocumentsListResponseDto } from '../dto/admission-required-document.dto';
import {
  ApplicantDocumentResponseDto,
  ApplicantDocumentsListResponseDto,
  DeleteApplicantDocumentResponseDto,
  ReplaceApplicantDocumentRequestDto,
  UploadApplicantDocumentRequestDto,
} from '../dto/applicant-document.dto';
import {
  ApplicantProfileResponseDto,
  CreateApplicantAccountDto,
} from '../dto/applicant-account.dto';
import {
  ApplicantRequestDetailResponseDto,
  ApplicantRequestsListResponseDto,
  CreateApplicantRequestDto,
  ListApplicantRequestsQueryDto,
} from '../dto/applicant-request.dto';
import {
  DiscoverableSchoolResponseDto,
  DiscoverableSchoolsListResponseDto,
  ListDiscoverableSchoolsQueryDto,
} from '../dto/school-discovery.dto';
import { UploadedMultipartFile } from '../../files/uploads/domain/uploaded-file';

@ApiTags('applicant-portal')
@Controller('applicant-portal')
export class ApplicantPortalController {
  constructor(
    private readonly createApplicantAccountUseCase: CreateApplicantAccountUseCase,
    private readonly getApplicantProfileUseCase: GetApplicantProfileUseCase,
    private readonly listDiscoverableSchoolsUseCase: ListDiscoverableSchoolsUseCase,
    private readonly getDiscoverableSchoolUseCase: GetDiscoverableSchoolUseCase,
    private readonly listAdmissionRequiredDocumentsUseCase: ListAdmissionRequiredDocumentsUseCase,
    private readonly createApplicantRequestUseCase: CreateApplicantRequestUseCase,
    private readonly listApplicantRequestsUseCase: ListApplicantRequestsUseCase,
    private readonly getApplicantRequestUseCase: GetApplicantRequestUseCase,
    private readonly submitApplicantRequestUseCase: SubmitApplicantRequestUseCase,
    private readonly uploadApplicantDocumentUseCase: UploadApplicantDocumentUseCase,
    private readonly listApplicantDocumentsUseCase: ListApplicantDocumentsUseCase,
    private readonly getApplicantDocumentUseCase: GetApplicantDocumentUseCase,
    private readonly getApplicantDocumentDownloadUrlUseCase: GetApplicantDocumentDownloadUrlUseCase,
    private readonly replaceApplicantDocumentUseCase: ReplaceApplicantDocumentUseCase,
    private readonly deleteApplicantDocumentUseCase: DeleteApplicantDocumentUseCase,
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

  @Get('schools/:schoolId/admission-required-documents')
  @PublicRoute()
  @ApiOperation({
    summary:
      'List active admission required documents safe for public Applicant Portal discovery',
  })
  @ApiParam({ name: 'schoolId', format: 'uuid' })
  @ApiOkResponse({ type: AdmissionRequiredDocumentsListResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiNotFoundResponse({ description: 'not_found' })
  listAdmissionRequiredDocuments(
    @Param('schoolId', new ParseUUIDPipe()) schoolId: string,
  ): Promise<AdmissionRequiredDocumentsListResponseDto> {
    return this.listAdmissionRequiredDocumentsUseCase.execute(schoolId);
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

  @Post('requests')
  @AllowApplicantPortalAccess()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create an authenticated applicant draft admission request',
  })
  @ApiCreatedResponse({ type: ApplicantRequestDetailResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiUnauthorizedResponse({ description: 'auth.token.invalid' })
  @ApiForbiddenResponse({ description: 'auth.scope.missing' })
  @ApiNotFoundResponse({ description: 'not_found' })
  createRequest(
    @Body() dto: CreateApplicantRequestDto,
    @Req() req: Request,
  ): Promise<ApplicantRequestDetailResponseDto> {
    return this.createApplicantRequestUseCase.execute({
      ...dto,
      ipAddress: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    });
  }

  @Get('requests')
  @AllowApplicantPortalAccess()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List authenticated applicant admission requests',
  })
  @ApiOkResponse({ type: ApplicantRequestsListResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiUnauthorizedResponse({ description: 'auth.token.invalid' })
  @ApiForbiddenResponse({ description: 'auth.scope.missing' })
  listRequests(
    @Query() query: ListApplicantRequestsQueryDto,
  ): Promise<ApplicantRequestsListResponseDto> {
    return this.listApplicantRequestsUseCase.execute(query);
  }

  @Get('requests/:requestId')
  @AllowApplicantPortalAccess()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Read an authenticated applicant admission request',
  })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiOkResponse({ type: ApplicantRequestDetailResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiUnauthorizedResponse({ description: 'auth.token.invalid' })
  @ApiForbiddenResponse({ description: 'auth.scope.missing' })
  @ApiNotFoundResponse({ description: 'not_found' })
  getRequest(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ): Promise<ApplicantRequestDetailResponseDto> {
    return this.getApplicantRequestUseCase.execute(requestId);
  }

  @Post('requests/:requestId/submit')
  @HttpCode(HttpStatus.OK)
  @AllowApplicantPortalAccess()
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Submit an authenticated applicant admission request into Admissions',
  })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiOkResponse({ type: ApplicantRequestDetailResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiUnauthorizedResponse({ description: 'auth.token.invalid' })
  @ApiForbiddenResponse({ description: 'auth.scope.missing' })
  @ApiNotFoundResponse({ description: 'not_found' })
  @ApiConflictResponse({ description: 'conflict' })
  submitRequest(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Req() req: Request,
  ): Promise<ApplicantRequestDetailResponseDto> {
    return this.submitApplicantRequestUseCase.execute({
      requestId,
      ipAddress: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    });
  }

  @Post('requests/:requestId/documents')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1 } }))
  @AllowApplicantPortalAccess()
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadApplicantDocumentRequestDto })
  @ApiOperation({
    summary: 'Upload an applicant-owned admission request document',
  })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiCreatedResponse({ type: ApplicantDocumentResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiUnauthorizedResponse({ description: 'auth.token.invalid' })
  @ApiForbiddenResponse({ description: 'auth.scope.missing' })
  @ApiNotFoundResponse({ description: 'not_found' })
  @ApiConflictResponse({ description: 'conflict' })
  uploadDocument(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @UploadedFile() file: UploadedMultipartFile | undefined,
    @Body() dto: UploadApplicantDocumentRequestDto,
    @Req() req: Request,
  ): Promise<ApplicantDocumentResponseDto> {
    return this.uploadApplicantDocumentUseCase.execute({
      requestId,
      file,
      requiredDocumentId: dto.requiredDocumentId,
      title: dto.title,
      documentType: dto.documentType,
      notes: dto.notes,
      ipAddress: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    });
  }

  @Get('requests/:requestId/documents')
  @AllowApplicantPortalAccess()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List authenticated applicant admission request documents',
  })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiOkResponse({ type: ApplicantDocumentsListResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiUnauthorizedResponse({ description: 'auth.token.invalid' })
  @ApiForbiddenResponse({ description: 'auth.scope.missing' })
  @ApiNotFoundResponse({ description: 'not_found' })
  listDocuments(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ): Promise<ApplicantDocumentsListResponseDto> {
    return this.listApplicantDocumentsUseCase.execute(requestId);
  }

  @Get('requests/:requestId/documents/:documentId')
  @AllowApplicantPortalAccess()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Read an authenticated applicant admission request document',
  })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiParam({ name: 'documentId', format: 'uuid' })
  @ApiOkResponse({ type: ApplicantDocumentResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiUnauthorizedResponse({ description: 'auth.token.invalid' })
  @ApiForbiddenResponse({ description: 'auth.scope.missing' })
  @ApiNotFoundResponse({ description: 'not_found' })
  getDocument(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ): Promise<ApplicantDocumentResponseDto> {
    return this.getApplicantDocumentUseCase.execute({
      requestId,
      documentId,
    });
  }

  @Get('requests/:requestId/documents/:documentId/download')
  @Redirect(undefined, 307)
  @AllowApplicantPortalAccess()
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Redirect an applicant to a short-lived download URL for their uploaded document',
  })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiParam({ name: 'documentId', format: 'uuid' })
  @ApiTemporaryRedirectResponse({
    description:
      'Redirects to a short-lived signed URL after applicant document ownership authorization',
  })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiUnauthorizedResponse({ description: 'auth.token.invalid' })
  @ApiForbiddenResponse({ description: 'auth.scope.missing' })
  @ApiNotFoundResponse({ description: 'not_found' })
  async downloadDocument(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Req() req: Request,
  ): Promise<{ url: string }> {
    return {
      url: await this.getApplicantDocumentDownloadUrlUseCase.execute({
        requestId,
        documentId,
        ipAddress: req.ip ?? null,
        userAgent: req.header('user-agent') ?? null,
      }),
    };
  }

  @Post('requests/:requestId/documents/:documentId/replacements')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1 } }))
  @AllowApplicantPortalAccess()
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ReplaceApplicantDocumentRequestDto })
  @ApiOperation({
    summary:
      'Replace an applicant-owned admission request document with a new upload',
  })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiParam({ name: 'documentId', format: 'uuid' })
  @ApiCreatedResponse({ type: ApplicantDocumentResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiUnauthorizedResponse({ description: 'auth.token.invalid' })
  @ApiForbiddenResponse({ description: 'auth.scope.missing' })
  @ApiNotFoundResponse({ description: 'not_found' })
  @ApiConflictResponse({ description: 'conflict' })
  replaceDocument(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @UploadedFile() file: UploadedMultipartFile | undefined,
    @Body() dto: ReplaceApplicantDocumentRequestDto,
    @Req() req: Request,
  ): Promise<ApplicantDocumentResponseDto> {
    return this.replaceApplicantDocumentUseCase.execute({
      requestId,
      documentId,
      file,
      title: dto.title,
      documentType: dto.documentType,
      notes: dto.notes,
      ipAddress: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    });
  }

  @Delete('requests/:requestId/documents/:documentId')
  @AllowApplicantPortalAccess()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Soft-delete an applicant-owned admission request document',
  })
  @ApiParam({ name: 'requestId', format: 'uuid' })
  @ApiParam({ name: 'documentId', format: 'uuid' })
  @ApiOkResponse({ type: DeleteApplicantDocumentResponseDto })
  @ApiBadRequestResponse({ description: 'validation.failed' })
  @ApiUnauthorizedResponse({ description: 'auth.token.invalid' })
  @ApiForbiddenResponse({ description: 'auth.scope.missing' })
  @ApiNotFoundResponse({ description: 'not_found' })
  @ApiConflictResponse({ description: 'conflict' })
  async deleteDocument(
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Req() req: Request,
  ): Promise<DeleteApplicantDocumentResponseDto> {
    await this.deleteApplicantDocumentUseCase.execute({
      requestId,
      documentId,
      ipAddress: req.ip ?? null,
      userAgent: req.header('user-agent') ?? null,
    });

    return { ok: true };
  }
}
