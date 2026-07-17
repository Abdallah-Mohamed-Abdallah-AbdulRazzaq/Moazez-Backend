import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { DiscoverableSchoolResponseDto } from '../dto/school-discovery.dto';
import { ApplicantPortalRepository } from '../infrastructure/applicant-portal.repository';
import { presentDiscoverableSchool } from '../presenters/school-discovery.presenter';
import { ResolveSchoolLogoUrlService } from '../../settings/branding/application/resolve-school-logo-url.service';

@Injectable()
export class GetDiscoverableSchoolUseCase {
  constructor(
    private readonly applicantPortalRepository: ApplicantPortalRepository,
    private readonly logoResolver: ResolveSchoolLogoUrlService,
  ) {}

  async execute(schoolId: string): Promise<DiscoverableSchoolResponseDto> {
    const school =
      await this.applicantPortalRepository.findDiscoverableSchoolById(schoolId);
    if (!school) {
      throw new NotFoundDomainException('School not found', { schoolId });
    }

    return presentDiscoverableSchool(
      school,
      await this.logoResolver.resolveForSchool(school.id),
    );
  }
}
