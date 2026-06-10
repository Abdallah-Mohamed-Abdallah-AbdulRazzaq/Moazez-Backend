import { Injectable } from '@nestjs/common';
import {
  ApplicantRequestsListResponseDto,
  ListApplicantRequestsQueryDto,
} from '../dto/applicant-request.dto';
import { normalizeApplicantRequestsQuery } from '../domain/applicant-request.inputs';
import { ApplicantPortalRepository } from '../infrastructure/applicant-portal.repository';
import { presentApplicantRequestsList } from '../presenters/applicant-request.presenter';
import { ApplicantPortalAccessService } from './applicant-portal-access.service';

@Injectable()
export class ListApplicantRequestsUseCase {
  constructor(
    private readonly applicantPortalAccessService: ApplicantPortalAccessService,
    private readonly applicantPortalRepository: ApplicantPortalRepository,
  ) {}

  async execute(
    query: ListApplicantRequestsQueryDto = new ListApplicantRequestsQueryDto(),
  ): Promise<ApplicantRequestsListResponseDto> {
    const applicantContext =
      await this.applicantPortalAccessService.getApplicantContext();
    const normalized = normalizeApplicantRequestsQuery(query);

    const result =
      await this.applicantPortalRepository.listApplicantAdmissionRequestsForApplicant(
        {
          applicantUserId: applicantContext.applicantUserId,
          page: normalized.page,
          limit: normalized.limit,
          status: normalized.status,
        },
      );

    const missingItemsCountBySchoolId = await this.countMissingItemsBySchoolId(
      result.items.map((request) => request.school.id),
    );

    return presentApplicantRequestsList({
      ...result,
      missingItemsCountBySchoolId,
    });
  }

  private async countMissingItemsBySchoolId(
    schoolIds: string[],
  ): Promise<Map<string, number>> {
    const uniqueSchoolIds = [...new Set(schoolIds)];
    const entries = await Promise.all(
      uniqueSchoolIds.map(
        async (schoolId) =>
          [
            schoolId,
            await this.applicantPortalRepository.countMandatoryRequiredDocumentsForSchool(
              schoolId,
            ),
          ] as const,
      ),
    );

    return new Map(entries);
  }
}
