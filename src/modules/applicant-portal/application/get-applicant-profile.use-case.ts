import { Injectable } from '@nestjs/common';
import { ApplicantProfileResponseDto } from '../dto/applicant-account.dto';
import { presentApplicantProfile } from '../presenters/applicant-profile.presenter';
import { ApplicantPortalAccessService } from './applicant-portal-access.service';

@Injectable()
export class GetApplicantProfileUseCase {
  constructor(
    private readonly applicantPortalAccessService: ApplicantPortalAccessService,
  ) {}

  async execute(): Promise<ApplicantProfileResponseDto> {
    const applicantContext =
      await this.applicantPortalAccessService.getApplicantContext();

    return presentApplicantProfile(applicantContext.profile);
  }
}
