import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { ApplicantDocumentsListResponseDto } from '../dto/applicant-document.dto';
import { ApplicantPortalRepository } from '../infrastructure/applicant-portal.repository';
import { presentApplicantDocumentsList } from '../presenters/applicant-document.presenter';
import { ApplicantPortalAccessService } from './applicant-portal-access.service';

@Injectable()
export class ListApplicantDocumentsUseCase {
  constructor(
    private readonly applicantPortalAccessService: ApplicantPortalAccessService,
    private readonly applicantPortalRepository: ApplicantPortalRepository,
  ) {}

  async execute(requestId: string): Promise<ApplicantDocumentsListResponseDto> {
    const applicantContext =
      await this.applicantPortalAccessService.getApplicantContext();

    const request =
      await this.applicantPortalRepository.findApplicantAdmissionRequestForDocumentAccess(
        {
          applicantUserId: applicantContext.applicantUserId,
          requestId,
        },
      );
    if (!request) {
      throw new NotFoundDomainException('Applicant request not found', {
        requestId,
      });
    }

    const documents =
      await this.applicantPortalRepository.listApplicantAdmissionRequestDocuments(
        {
          applicantUserId: applicantContext.applicantUserId,
          requestId,
        },
      );

    return presentApplicantDocumentsList(documents);
  }
}
