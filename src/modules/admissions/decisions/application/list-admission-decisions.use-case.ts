import { Injectable } from '@nestjs/common';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { requireApplicationsScope } from '../../applications/applications-scope';
import {
  AdmissionDecisionsListResponseDto,
  ListAdmissionDecisionsQueryDto,
} from '../dto/admission-decision.dto';
import { mapAdmissionDecisionFromApi } from '../domain/admission-decision.enums';
import { AdmissionDecisionsRepository } from '../infrastructure/admission-decisions.repository';
import { presentAdmissionDecisions } from '../presenters/admission-decision.presenter';

@Injectable()
export class ListAdmissionDecisionsUseCase {
  constructor(
    private readonly admissionDecisionsRepository: AdmissionDecisionsRepository,
  ) {}

  async execute(
    query: ListAdmissionDecisionsQueryDto,
  ): Promise<AdmissionDecisionsListResponseDto> {
    requireApplicationsScope();

    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;

    if (dateFrom && dateTo && dateFrom > dateTo) {
      throw new ValidationDomainException(
        'dateFrom must be before or equal to dateTo',
        {
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
        },
      );
    }

    const { items, total } =
      await this.admissionDecisionsRepository.listAdmissionDecisions({
        search: query.search,
        decision: query.decision
          ? mapAdmissionDecisionFromApi(query.decision)
          : undefined,
        dateFrom,
        dateTo,
        page: query.page,
        limit: query.limit,
      });

    return presentAdmissionDecisions({
      items,
      page: query.page,
      limit: query.limit,
      total,
    });
  }
}
