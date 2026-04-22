import { Module } from '@nestjs/common';
import { UploadsModule } from '../../files/uploads/uploads.module';
import { ApplicationsModule } from '../applications/applications.module';
import { CreateApplicationDocumentUseCase } from './application/create-application-document.use-case';
import { DeleteApplicationDocumentUseCase } from './application/delete-application-document.use-case';
import { ListApplicationDocumentsUseCase } from './application/list-application-documents.use-case';
import { ApplicationDocumentsController } from './controller/application-documents.controller';
import { ApplicationDocumentsRepository } from './infrastructure/application-documents.repository';

@Module({
  imports: [ApplicationsModule, UploadsModule],
  controllers: [ApplicationDocumentsController],
  providers: [
    ApplicationDocumentsRepository,
    ListApplicationDocumentsUseCase,
    CreateApplicationDocumentUseCase,
    DeleteApplicationDocumentUseCase,
  ],
})
export class DocumentsModule {}
