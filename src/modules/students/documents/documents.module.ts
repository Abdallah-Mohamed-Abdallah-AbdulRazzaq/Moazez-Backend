import { Module } from '@nestjs/common';
import { UploadsModule } from '../../files/uploads/uploads.module';
import { StudentsRecordsModule } from '../students/students.module';
import { CreateStudentDocumentUseCase } from './application/create-student-document.use-case';
import { DeleteStudentDocumentUseCase } from './application/delete-student-document.use-case';
import { ListMissingStudentDocumentsUseCase } from './application/list-missing-student-documents.use-case';
import { ListStudentDocumentsUseCase } from './application/list-student-documents.use-case';
import { UpdateStudentDocumentUseCase } from './application/update-student-document.use-case';
import { DocumentsController } from './controller/documents.controller';
import { StudentDocumentsController } from './controller/student-documents.controller';
import { StudentDocumentsRepository } from './infrastructure/student-documents.repository';

@Module({
  imports: [StudentsRecordsModule, UploadsModule],
  controllers: [StudentDocumentsController, DocumentsController],
  providers: [
    StudentDocumentsRepository,
    ListStudentDocumentsUseCase,
    ListMissingStudentDocumentsUseCase,
    CreateStudentDocumentUseCase,
    UpdateStudentDocumentUseCase,
    DeleteStudentDocumentUseCase,
  ],
})
export class DocumentsModule {}
