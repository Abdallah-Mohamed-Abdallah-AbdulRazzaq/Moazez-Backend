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

    const [missingItemsCountByRequestId, mandatoryItemsCountBySchoolId] =
      await Promise.all([
        this.countMissingItemsByRequestId(result.items),
        this.countMandatoryItemsBySchoolId(
          result.items.map((request) => request.school.id),
        ),
      ]);

    return presentApplicantRequestsList({
      ...result,
      missingItemsCountByRequestId,
      mandatoryItemsCountBySchoolId,
    });
  }

  private async countMandatoryItemsBySchoolId(
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

  private async countMissingItemsByRequestId(
    requests: Array<{ id: string; school: { id: string } }>,
  ): Promise<Map<string, number>> {
    const entries = await Promise.all(
      requests.map(
        async (request) =>
          [
            request.id,
            await this.applicantPortalRepository.countMissingMandatoryRequiredDocumentsForRequest(
              {
                schoolId: request.school.id,
                requestId: request.id,
              },
            ),
          ] as const,
      ),
    );

    return new Map(entries);
  }
}
