import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireApplicationsScope } from '../../applications/applications-scope';
import { ApplicationsRepository } from '../../applications/infrastructure/applications.repository';
import { ApplicationDocumentResponseDto } from '../dto/application-document.dto';
import { ApplicationDocumentsRepository } from '../infrastructure/application-documents.repository';
import { presentApplicationDocument } from '../presenters/application-document.presenter';

@Injectable()
export class ListApplicationDocumentsUseCase {
  constructor(
    private readonly applicationsRepository: ApplicationsRepository,
    private readonly applicationDocumentsRepository: ApplicationDocumentsRepository,
  ) {}

  async execute(
    applicationId: string,
  ): Promise<ApplicationDocumentResponseDto[]> {
    requireApplicationsScope();

    const application =
      await this.applicationsRepository.findApplicationById(applicationId);
    if (!application) {
      throw new NotFoundDomainException('Application not found', {
        applicationId,
      });
    }

    const documents =
      await this.applicationDocumentsRepository.listApplicationDocuments(
        applicationId,
      );

    return documents.map((document) => presentApplicationDocument(document));
  }
}
