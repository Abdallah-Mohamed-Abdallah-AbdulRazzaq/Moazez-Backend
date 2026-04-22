import { Injectable } from '@nestjs/common';
import { ValidationDomainException } from '../../../../common/exceptions/domain-exception';
import { requireApplicationsScope } from '../../applications/applications-scope';
import { ListPlacementTestsQueryDto, PlacementTestsListResponseDto } from '../dto/placement-test.dto';
import { mapPlacementTestStatusFromApi } from '../domain/placement-test.enums';
import { PlacementTestsRepository } from '../infrastructure/placement-tests.repository';
import { presentPlacementTests } from '../presenters/placement-test.presenter';

@Injectable()
export class ListPlacementTestsUseCase {
  constructor(
    private readonly placementTestsRepository: PlacementTestsRepository,
  ) {}

  async execute(
    query: ListPlacementTestsQueryDto,
  ): Promise<PlacementTestsListResponseDto> {
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
      await this.placementTestsRepository.listPlacementTests({
        search: query.search,
        status: query.status
          ? mapPlacementTestStatusFromApi(query.status)
          : undefined,
        type: query.type,
        dateFrom,
        dateTo,
        page: query.page,
        limit: query.limit,
      });

    return presentPlacementTests({
      items,
      page: query.page,
      limit: query.limit,
      total,
    });
  }
}
