import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateApplicationDocumentUseCase } from '../application/create-application-document.use-case';
import { DeleteApplicationDocumentUseCase } from '../application/delete-application-document.use-case';
import { ListApplicationDocumentsUseCase } from '../application/list-application-documents.use-case';
import {
  ApplicationDocumentResponseDto,
  CreateApplicationDocumentDto,
  DeleteApplicationDocumentResponseDto,
} from '../dto/application-document.dto';

@ApiTags('admissions-documents')
@ApiBearerAuth()
@Controller('admissions/applications/:applicationId/documents')
export class ApplicationDocumentsController {
  constructor(
    private readonly listApplicationDocumentsUseCase: ListApplicationDocumentsUseCase,
    private readonly createApplicationDocumentUseCase: CreateApplicationDocumentUseCase,
    private readonly deleteApplicationDocumentUseCase: DeleteApplicationDocumentUseCase,
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
