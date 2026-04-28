import { Injectable } from '@nestjs/common';
import { ListReinforcementReviewQueueQueryDto } from '../dto/reinforcement-review.dto';
import { ReinforcementReviewsRepository } from '../infrastructure/reinforcement-reviews.repository';
import { presentReinforcementReviewQueue } from '../presenters/reinforcement-review.presenter';
import { normalizeReviewQueueFilters } from './reinforcement-review-use-case.helpers';

@Injectable()
export class ListReinforcementReviewQueueUseCase {
  constructor(
    private readonly reviewsRepository: ReinforcementReviewsRepository,
  ) {}

  async execute(query: ListReinforcementReviewQueueQueryDto) {
    const filters = normalizeReviewQueueFilters(query);
    const result = await this.reviewsRepository.listReviewQueue(filters);
    return presentReinforcementReviewQueue({
      items: result.items,
      total: result.total,
      limit: filters.limit,
      offset: filters.offset,
    });
  }
}
