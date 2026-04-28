import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { ApproveReinforcementSubmissionUseCase } from './application/approve-reinforcement-submission.use-case';
import { GetReinforcementReviewItemUseCase } from './application/get-reinforcement-review-item.use-case';
import { ListReinforcementReviewQueueUseCase } from './application/list-reinforcement-review-queue.use-case';
import { RejectReinforcementSubmissionUseCase } from './application/reject-reinforcement-submission.use-case';
import { SubmitReinforcementStageUseCase } from './application/submit-reinforcement-stage.use-case';
import { ReinforcementReviewsController } from './controller/reinforcement-reviews.controller';
import { ReinforcementReviewsRepository } from './infrastructure/reinforcement-reviews.repository';

@Module({
  imports: [AuthModule],
  controllers: [ReinforcementReviewsController],
  providers: [
    ReinforcementReviewsRepository,
    SubmitReinforcementStageUseCase,
    ListReinforcementReviewQueueUseCase,
    GetReinforcementReviewItemUseCase,
    ApproveReinforcementSubmissionUseCase,
    RejectReinforcementSubmissionUseCase,
  ],
})
export class ReviewsModule {}
