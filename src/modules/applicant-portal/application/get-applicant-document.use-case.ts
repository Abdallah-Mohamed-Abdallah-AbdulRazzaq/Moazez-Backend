import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { ApplicantDocumentResponseDto } from '../dto/applicant-document.dto';
import { ApplicantPortalRepository } from '../infrastructure/applicant-portal.repository';
import { presentApplicantDocument } from '../presenters/applicant-document.presenter';
import { ApplicantPortalAccessService } from './applicant-portal-access.service';

@Injectable()
export class GetApplicantDocumentUseCase {
  constructor(
    private readonly applicantPortalAccessService: ApplicantPortalAccessService,
    private readonly applicantPortalRepository: ApplicantPortalRepository,
  ) {}

  async execute(params: {
    requestId: string;
    documentId: string;
  }): Promise<ApplicantDocumentResponseDto> {
    const applicantContext =
      await this.applicantPortalAccessService.getApplicantContext();

    const document =
      await this.applicantPortalRepository.findApplicantAdmissionRequestDocumentForApplicant(
        {
          applicantUserId: applicantContext.applicantUserId,
          requestId: params.requestId,
          documentId: params.documentId,
        },
      );
    if (!document) {
      throw new NotFoundDomainException('Applicant document not found', {
        requestId: params.requestId,
        documentId: params.documentId,
      });
    }

    return presentApplicantDocument(document);
  }
}
