import { Module } from '@nestjs/common';
import { UploadsModule } from '../../files/uploads/uploads.module';
import { AuthModule } from '../../iam/auth/auth.module';
import { StudentsRecordsModule } from '../students/students.module';
import { CreateStudentDocumentUseCase } from './application/create-student-document.use-case';
import { DeleteStudentDocumentUseCase } from './application/delete-student-document.use-case';
import { ImportApplicationDocumentsUseCase } from './application/import-application-documents.use-case';
import { ListMissingStudentDocumentsUseCase } from './application/list-missing-student-documents.use-case';
import { ListStudentDocumentsUseCase } from './application/list-student-documents.use-case';
import { UpdateStudentDocumentUseCase } from './application/update-student-document.use-case';
import { DocumentsController } from './controller/documents.controller';
import { StudentDocumentsController } from './controller/student-documents.controller';
import { StudentDocumentsRepository } from './infrastructure/student-documents.repository';

@Module({
  imports: [AuthModule, StudentsRecordsModule, UploadsModule],
  controllers: [StudentDocumentsController, DocumentsController],
  providers: [
    StudentDocumentsRepository,
    ListStudentDocumentsUseCase,
    ListMissingStudentDocumentsUseCase,
    CreateStudentDocumentUseCase,
    ImportApplicationDocumentsUseCase,
    UpdateStudentDocumentUseCase,
    DeleteStudentDocumentUseCase,
  ],
})
export class DocumentsModule {}
