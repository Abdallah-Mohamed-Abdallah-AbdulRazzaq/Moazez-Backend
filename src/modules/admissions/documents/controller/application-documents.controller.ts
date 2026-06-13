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
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateApplicationDocumentUseCase } from '../application/create-application-document.use-case';
import { DeleteApplicationDocumentUseCase } from '../application/delete-application-document.use-case';
import { ListApplicationDocumentsUseCase } from '../application/list-application-documents.use-case';
import { ReviewApplicationDocumentUseCase } from '../application/review-application-document.use-case';
import {
  ApplicationDocumentResponseDto,
  CreateApplicationDocumentDto,
  DeleteApplicationDocumentResponseDto,
  RequireApplicationDocumentReviewNoteDto,
  ReviewApplicationDocumentDto,
} from '../dto/application-document.dto';

@ApiTags('admissions-documents')
@ApiBearerAuth()
@Controller('admissions/applications/:applicationId/documents')
export class ApplicationDocumentsController {
  constructor(
    private readonly listApplicationDocumentsUseCase: ListApplicationDocumentsUseCase,
    private readonly createApplicationDocumentUseCase: CreateApplicationDocumentUseCase,
    private readonly deleteApplicationDocumentUseCase: DeleteApplicationDocumentUseCase,
    private readonly reviewApplicationDocumentUseCase: ReviewApplicationDocumentUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: ApplicationDocumentResponseDto, isArray: true })
  @RequiredPermissions('admissions.documents.view')
  listDocuments(
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
  ): Promise<ApplicationDocumentResponseDto[]> {
    return this.listApplicationDocumentsUseCase.execute(applicationId);
  }

  @Post()
  @ApiCreatedResponse({ type: ApplicationDocumentResponseDto })
  @RequiredPermissions('admissions.documents.manage')
  createDocument(
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
    @Body() dto: CreateApplicationDocumentDto,
  ): Promise<ApplicationDocumentResponseDto> {
    return this.createApplicationDocumentUseCase.execute(applicationId, dto);
  }

  @Post(':documentId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ApplicationDocumentResponseDto })
  @RequiredPermissions('admissions.documents.manage')
  acceptDocument(
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body() dto: ReviewApplicationDocumentDto,
  ): Promise<ApplicationDocumentResponseDto> {
    return this.reviewApplicationDocumentUseCase.accept(
      applicationId,
      documentId,
      dto,
    );
  }

  @Post(':documentId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ApplicationDocumentResponseDto })
  @RequiredPermissions('admissions.documents.manage')
  rejectDocument(
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body() dto: RequireApplicationDocumentReviewNoteDto,
  ): Promise<ApplicationDocumentResponseDto> {
    return this.reviewApplicationDocumentUseCase.reject(
      applicationId,
      documentId,
      dto,
    );
  }

  @Post(':documentId/request-replacement')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ApplicationDocumentResponseDto })
  @RequiredPermissions('admissions.documents.manage')
  requestReplacement(
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body() dto: RequireApplicationDocumentReviewNoteDto,
  ): Promise<ApplicationDocumentResponseDto> {
    return this.reviewApplicationDocumentUseCase.requestReplacement(
      applicationId,
      documentId,
      dto,
    );
  }

  @Delete(':documentId')
  @ApiOkResponse({ type: DeleteApplicationDocumentResponseDto })
  @RequiredPermissions('admissions.documents.manage')
  deleteDocument(
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ): Promise<DeleteApplicationDocumentResponseDto> {
    return this.deleteApplicationDocumentUseCase.execute(
      applicationId,
      documentId,
    );
  }
}
