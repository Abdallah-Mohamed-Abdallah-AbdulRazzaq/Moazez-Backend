import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireApplicationsScope } from '../../applications/applications-scope';
import { ApplicationsRepository } from '../../applications/infrastructure/applications.repository';
import { DeleteApplicationDocumentResponseDto } from '../dto/application-document.dto';
import { ApplicationDocumentsRepository } from '../infrastructure/application-documents.repository';

@Injectable()
export class DeleteApplicationDocumentUseCase {
  constructor(
    private readonly applicationsRepository: ApplicationsRepository,
    private readonly applicationDocumentsRepository: ApplicationDocumentsRepository,
  ) {}

  async execute(
    applicationId: string,
    documentId: string,
  ): Promise<DeleteApplicationDocumentResponseDto> {
    requireApplicationsScope();

    const application =
      await this.applicationsRepository.findApplicationById(applicationId);
    if (!application) {
      throw new NotFoundDomainException('Application not found', {
        applicationId,
      });
    }

    const result =
      await this.applicationDocumentsRepository.deleteApplicationDocument({
        applicationId,
        documentId,
      });
    if (result.status === 'not_found') {
      throw new NotFoundDomainException('Application document not found', {
        applicationId,
        documentId,
      });
    }

    return { ok: true };
  }
}
