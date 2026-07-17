import { Injectable } from '@nestjs/common';
import {
  DiscoverableSchoolsListResponseDto,
  ListDiscoverableSchoolsQueryDto,
} from '../dto/school-discovery.dto';
import { normalizeSchoolDiscoveryQuery } from '../domain/school-discovery.inputs';
import { ApplicantPortalRepository } from '../infrastructure/applicant-portal.repository';
import { presentDiscoverableSchoolsList } from '../presenters/school-discovery.presenter';
import { ResolveSchoolLogoUrlService } from '../../settings/branding/application/resolve-school-logo-url.service';

@Injectable()
export class ListDiscoverableSchoolsUseCase {
  constructor(
    private readonly applicantPortalRepository: ApplicantPortalRepository,
    private readonly logoResolver: ResolveSchoolLogoUrlService,
  ) {}

  async execute(
    query: ListDiscoverableSchoolsQueryDto = new ListDiscoverableSchoolsQueryDto(),
  ): Promise<DiscoverableSchoolsListResponseDto> {
    const normalized = normalizeSchoolDiscoveryQuery(query);
    const result =
      await this.applicantPortalRepository.listDiscoverableSchools(normalized);
    const logoUrlsBySchoolId = await this.logoResolver.resolveForSchools(
      result.items.map((school) => school.id),
    );

    return presentDiscoverableSchoolsList({ ...result, logoUrlsBySchoolId });
  }
}
