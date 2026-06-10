import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { ApplicantRequestDetailResponseDto } from '../dto/applicant-request.dto';
import { ApplicantPortalRepository } from '../infrastructure/applicant-portal.repository';
import { presentApplicantRequestDetail } from '../presenters/applicant-request.presenter';
import { ApplicantPortalAccessService } from './applicant-portal-access.service';

@Injectable()
export class GetApplicantRequestUseCase {
  constructor(
    private readonly applicantPortalAccessService: ApplicantPortalAccessService,
    private readonly applicantPortalRepository: ApplicantPortalRepository,
  ) {}

  async execute(requestId: string): Promise<ApplicantRequestDetailResponseDto> {
    const applicantContext =
      await this.applicantPortalAccessService.getApplicantContext();
    const request =
      await this.applicantPortalRepository.findApplicantAdmissionRequestForApplicant(
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

    const missingItemsCount =
      await this.applicantPortalRepository.countMandatoryRequiredDocumentsForSchool(
        request.school.id,
      );

    return presentApplicantRequestDetail(request, missingItemsCount);
  }
}
