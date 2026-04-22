import { AdmissionDocumentStatus } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { FilesNotFoundException } from '../../../files/uploads/domain/file-upload.exceptions';
import { FilesRepository } from '../../../files/uploads/infrastructure/files.repository';
import { requireApplicationsScope } from '../../applications/applications-scope';
import {
  mapApplicationDocumentStatusFromApi,
} from '../../applications/domain/application.enums';
import { ApplicationsRepository } from '../../applications/infrastructure/applications.repository';
import { CreateApplicationDocumentDto, ApplicationDocumentResponseDto } from '../dto/application-document.dto';
import { ApplicationDocumentsRepository } from '../infrastructure/application-documents.repository';
import { presentApplicationDocument } from '../presenters/application-document.presenter';

@Injectable()
export class CreateApplicationDocumentUseCase {
  constructor(
    private readonly applicationsRepository: ApplicationsRepository,
    private readonly applicationDocumentsRepository: ApplicationDocumentsRepository,
    private readonly filesRepository: FilesRepository,
  ) {}

  async execute(
    applicationId: string,
    command: CreateApplicationDocumentDto,
  ): Promise<ApplicationDocumentResponseDto> {
    const scope = requireApplicationsScope();

    const application =
      await this.applicationsRepository.findApplicationById(applicationId);
    if (!application) {
      throw new NotFoundDomainException('Application not found', {
        applicationId,
      });
    }

    const file = await this.filesRepository.findScopedFileById(command.fileId);
    if (!file) {
      throw new FilesNotFoundException({ fileId: command.fileId });
    }

    const existing =
      await this.applicationDocumentsRepository.findApplicationDocumentByType({
        applicationId,
        documentType: command.documentType.trim(),
      });

    const status = command.status
      ? mapApplicationDocumentStatusFromApi(command.status)
      : AdmissionDocumentStatus.COMPLETE;
    const notes = command.notes?.trim() || null;
    const documentType = command.documentType.trim();

    const document = existing
      ? await this.applicationDocumentsRepository.updateApplicationDocument(
          existing.id,
          {
            fileId: command.fileId,
            status,
            notes,
            documentType,
          },
        )
      : await this.applicationDocumentsRepository.createApplicationDocument({
          schoolId: scope.schoolId,
          applicationId,
          fileId: command.fileId,
          documentType,
          status,
          notes,
        });

    if (!document) {
      throw new NotFoundDomainException('Application document not found', {
        applicationId,
      });
    }

    return presentApplicationDocument(document);
  }
}
