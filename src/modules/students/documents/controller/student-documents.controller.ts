import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { UploadedMultipartFile } from '../../../files/uploads/domain/uploaded-file';
import { CreateStudentDocumentUseCase } from '../application/create-student-document.use-case';
import { ListMissingStudentDocumentsUseCase } from '../application/list-missing-student-documents.use-case';
import { ListStudentDocumentsUseCase } from '../application/list-student-documents.use-case';
import {
  CreateStudentDocumentDto,
  StudentDocumentResponseDto,
} from '../dto/student-document.dto';

@ApiTags('students-guardians')
@ApiBearerAuth()
@Controller('students-guardians/students')
export class StudentDocumentsController {
  constructor(
    private readonly listStudentDocumentsUseCase: ListStudentDocumentsUseCase,
    private readonly listMissingStudentDocumentsUseCase: ListMissingStudentDocumentsUseCase,
    private readonly createStudentDocumentUseCase: CreateStudentDocumentUseCase,
  ) {}

  @Get(':studentId/documents')
  @ApiOkResponse({ type: StudentDocumentResponseDto, isArray: true })
  @RequiredPermissions('students.documents.view')
  listDocuments(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<StudentDocumentResponseDto[]> {
    return this.listStudentDocumentsUseCase.execute(studentId);
  }

  @Get(':studentId/documents/missing')
  @ApiOkResponse({ type: StudentDocumentResponseDto, isArray: true })
  @RequiredPermissions('students.documents.view')
  listMissingDocuments(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<StudentDocumentResponseDto[]> {
    return this.listMissingStudentDocumentsUseCase.execute(studentId);
  }

  @Post(':studentId/documents')
  @UseInterceptors(FileInterceptor('file', { limits: { files: 1 } }))
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiBody({ type: CreateStudentDocumentDto })
  @ApiCreatedResponse({ type: StudentDocumentResponseDto })
  @RequiredPermissions('students.documents.manage')
  createDocument(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Body() dto: CreateStudentDocumentDto,
    @UploadedFile() file: UploadedMultipartFile | undefined,
  ): Promise<StudentDocumentResponseDto> {
    return this.createStudentDocumentUseCase.execute(studentId, dto, file);
  }
}
