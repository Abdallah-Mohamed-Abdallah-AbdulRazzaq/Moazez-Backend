import { Module } from '@nestjs/common';
import { StorageModule } from '../../../infrastructure/storage/storage.module';
import { AuthModule } from '../../iam/auth/auth.module';
import { ApproveReinforcementSubmissionUseCase } from './application/approve-reinforcement-submission.use-case';
import { GetReinforcementReviewItemUseCase } from './application/get-reinforcement-review-item.use-case';
import { ListReinforcementReviewQueueUseCase } from './application/list-reinforcement-review-queue.use-case';
import { RejectReinforcementSubmissionUseCase } from './application/reject-reinforcement-submission.use-case';
import { ReinforcementProofContentVerifierService } from './application/reinforcement-proof-content-verifier.service';
import { SubmitReinforcementStageUseCase } from './application/submit-reinforcement-stage.use-case';
import { ReinforcementReviewsController } from './controller/reinforcement-reviews.controller';
import { ReinforcementReviewsRepository } from './infrastructure/reinforcement-reviews.repository';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [ReinforcementReviewsController],
  providers: [
    ReinforcementReviewsRepository,
    ReinforcementProofContentVerifierService,
    SubmitReinforcementStageUseCase,
    ListReinforcementReviewQueueUseCase,
    GetReinforcementReviewItemUseCase,
    ApproveReinforcementSubmissionUseCase,
    RejectReinforcementSubmissionUseCase,
  ],
  exports: [
    SubmitReinforcementStageUseCase,
    ApproveReinforcementSubmissionUseCase,
    RejectReinforcementSubmissionUseCase,
  ],
})
export class ReviewsModule {}
