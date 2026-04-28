import { Injectable } from '@nestjs/common';
import { ReinforcementReviewsRepository } from '../infrastructure/reinforcement-reviews.repository';
import { presentReinforcementReviewItemDetail } from '../presenters/reinforcement-review.presenter';
import { findReviewItemOrThrow } from './reinforcement-review-use-case.helpers';

@Injectable()
export class GetReinforcementReviewItemUseCase {
  constructor(
    private readonly reviewsRepository: ReinforcementReviewsRepository,
  ) {}

  async execute(submissionId: string) {
    const submission = await findReviewItemOrThrow(
      this.reviewsRepository,
      submissionId,
    );
    return presentReinforcementReviewItemDetail(submission);
  }
}
