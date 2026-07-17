import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { ApplicantRequestDetailResponseDto } from '../dto/applicant-request.dto';
import { ApplicantPortalRepository } from '../infrastructure/applicant-portal.repository';
import { presentApplicantRequestDetail } from '../presenters/applicant-request.presenter';
import { ApplicantPortalAccessService } from './applicant-portal-access.service';
import { ResolveSchoolLogoUrlService } from '../../settings/branding/application/resolve-school-logo-url.service';

@Injectable()
export class GetApplicantRequestUseCase {
  constructor(
    private readonly applicantPortalAccessService: ApplicantPortalAccessService,
    private readonly applicantPortalRepository: ApplicantPortalRepository,
    private readonly logoResolver: ResolveSchoolLogoUrlService,
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

    const [missingItemsCount, mandatoryItemsCount, logoUrl] = await Promise.all(
      [
        this.applicantPortalRepository.countMissingMandatoryRequiredDocumentsForRequest(
          {
            schoolId: request.school.id,
            requestId: request.id,
          },
        ),
        this.applicantPortalRepository.countMandatoryRequiredDocumentsForSchool(
          request.school.id,
        ),
        this.logoResolver.resolveForSchool(request.school.id),
      ],
    );

    return presentApplicantRequestDetail(
      request,
      missingItemsCount,
      mandatoryItemsCount,
      logoUrl,
    );
  }
}
