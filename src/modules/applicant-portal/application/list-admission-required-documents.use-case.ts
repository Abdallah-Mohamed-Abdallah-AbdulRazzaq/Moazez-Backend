import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { AdmissionRequiredDocumentsListResponseDto } from '../dto/admission-required-document.dto';
import { ApplicantPortalRepository } from '../infrastructure/applicant-portal.repository';
import { presentAdmissionRequiredDocumentsList } from '../presenters/admission-required-documents.presenter';

@Injectable()
export class ListAdmissionRequiredDocumentsUseCase {
  constructor(
    private readonly applicantPortalRepository: ApplicantPortalRepository,
  ) {}

  async execute(
    schoolId: string,
  ): Promise<AdmissionRequiredDocumentsListResponseDto> {
    const school =
      await this.applicantPortalRepository.findDiscoverableSchoolById(schoolId);
    if (!school) {
      throw new NotFoundDomainException('School not found', { schoolId });
    }

    const documents =
      await this.applicantPortalRepository.listActiveAdmissionRequiredDocumentsForSchool(
        schoolId,
      );

    return presentAdmissionRequiredDocumentsList(documents);
  }
}
