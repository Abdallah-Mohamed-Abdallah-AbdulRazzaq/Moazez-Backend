import { Injectable } from '@nestjs/common';
import {
  DiscoverableSchoolsListResponseDto,
  ListDiscoverableSchoolsQueryDto,
} from '../dto/school-discovery.dto';
import { normalizeSchoolDiscoveryQuery } from '../domain/school-discovery.inputs';
import { ApplicantPortalRepository } from '../infrastructure/applicant-portal.repository';
import { presentDiscoverableSchoolsList } from '../presenters/school-discovery.presenter';

@Injectable()
export class ListDiscoverableSchoolsUseCase {
  constructor(
    private readonly applicantPortalRepository: ApplicantPortalRepository,
  ) {}

  async execute(
    query: ListDiscoverableSchoolsQueryDto = new ListDiscoverableSchoolsQueryDto(),
  ): Promise<DiscoverableSchoolsListResponseDto> {
    const normalized = normalizeSchoolDiscoveryQuery(query);
    const result =
      await this.applicantPortalRepository.listDiscoverableSchools(normalized);

    return presentDiscoverableSchoolsList(result);
  }
}
