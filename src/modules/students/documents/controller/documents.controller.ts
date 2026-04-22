import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { DeleteStudentDocumentUseCase } from '../application/delete-student-document.use-case';
import { UpdateStudentDocumentUseCase } from '../application/update-student-document.use-case';
import {
  DeleteStudentDocumentResponseDto,
  StudentDocumentResponseDto,
  UpdateStudentDocumentDto,
} from '../dto/student-document.dto';

@ApiTags('students-guardians')
@ApiBearerAuth()
@Controller('students-guardians/documents')
export class DocumentsController {
  constructor(
    private readonly updateStudentDocumentUseCase: UpdateStudentDocumentUseCase,
    private readonly deleteStudentDocumentUseCase: DeleteStudentDocumentUseCase,
  ) {}

  @Patch(':documentId')
  @ApiOkResponse({ type: StudentDocumentResponseDto })
  @RequiredPermissions('students.documents.manage')
  updateDocument(
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body() dto: UpdateStudentDocumentDto,
  ): Promise<StudentDocumentResponseDto> {
    return this.updateStudentDocumentUseCase.execute(documentId, dto);
  }

  @Delete(':documentId')
  @ApiOkResponse({ type: DeleteStudentDocumentResponseDto })
  @RequiredPermissions('students.documents.manage')
  deleteDocument(
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ): Promise<DeleteStudentDocumentResponseDto> {
    return this.deleteStudentDocumentUseCase.execute(documentId);
  }
}
