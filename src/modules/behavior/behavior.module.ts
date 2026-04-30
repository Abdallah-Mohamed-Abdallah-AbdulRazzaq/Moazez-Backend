import { Module } from '@nestjs/common';
import { AuthModule } from '../iam/auth/auth.module';
import {
  CreateBehaviorCategoryUseCase,
  DeleteBehaviorCategoryUseCase,
  GetBehaviorCategoryUseCase,
  ListBehaviorCategoriesUseCase,
  UpdateBehaviorCategoryUseCase,
} from './application/behavior-categories.use-cases';
import {
  CancelBehaviorRecordUseCase,
  CreateBehaviorRecordUseCase,
  GetBehaviorRecordUseCase,
  ListBehaviorRecordsUseCase,
  SubmitBehaviorRecordUseCase,
  UpdateBehaviorRecordUseCase,
} from './application/behavior-records.use-cases';
import {
  ApproveBehaviorRecordUseCase,
  GetBehaviorReviewQueueItemUseCase,
  ListBehaviorReviewQueueUseCase,
  RejectBehaviorRecordUseCase,
} from './application/behavior-review.use-cases';
import { BehaviorCategoriesController } from './controller/behavior-categories.controller';
import { BehaviorRecordsController } from './controller/behavior-records.controller';
import { BehaviorReviewController } from './controller/behavior-review.controller';
import { BehaviorCategoriesRepository } from './infrastructure/behavior-categories.repository';
import { BehaviorRecordsRepository } from './infrastructure/behavior-records.repository';
import { BehaviorReviewRepository } from './infrastructure/behavior-review.repository';

@Module({
  imports: [AuthModule],
  controllers: [
    BehaviorCategoriesController,
    BehaviorRecordsController,
    BehaviorReviewController,
  ],
  providers: [
    BehaviorCategoriesRepository,
    BehaviorRecordsRepository,
    BehaviorReviewRepository,
    ListBehaviorCategoriesUseCase,
    GetBehaviorCategoryUseCase,
    CreateBehaviorCategoryUseCase,
    UpdateBehaviorCategoryUseCase,
    DeleteBehaviorCategoryUseCase,
    ListBehaviorRecordsUseCase,
    GetBehaviorRecordUseCase,
    CreateBehaviorRecordUseCase,
    UpdateBehaviorRecordUseCase,
    SubmitBehaviorRecordUseCase,
    CancelBehaviorRecordUseCase,
    ListBehaviorReviewQueueUseCase,
    GetBehaviorReviewQueueItemUseCase,
    ApproveBehaviorRecordUseCase,
    RejectBehaviorRecordUseCase,
  ],
})
export class BehaviorModule {}
