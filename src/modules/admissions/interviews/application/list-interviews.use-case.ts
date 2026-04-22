import { Injectable } from '@nestjs/common';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { requireApplicationsScope } from '../../applications/applications-scope';
import { InterviewsListResponseDto, ListInterviewsQueryDto } from '../dto/interview.dto';
import { mapInterviewStatusFromApi } from '../domain/interview.enums';
import { InterviewsRepository } from '../infrastructure/interviews.repository';
import { presentInterviews } from '../presenters/interview.presenter';

@Injectable()
export class ListInterviewsUseCase {
  constructor(private readonly interviewsRepository: InterviewsRepository) {}

  async execute(
    query: ListInterviewsQueryDto,
  ): Promise<InterviewsListResponseDto> {
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

    const { items, total } = await this.interviewsRepository.listInterviews({
      search: query.search,
      status: query.status
        ? mapInterviewStatusFromApi(query.status)
        : undefined,
      dateFrom,
      dateTo,
      page: query.page,
      limit: query.limit,
    });

    return presentInterviews({
      items,
      page: query.page,
      limit: query.limit,
      total,
    });
  }
}
