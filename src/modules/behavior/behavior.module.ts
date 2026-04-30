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
import { BehaviorCategoriesController } from './controller/behavior-categories.controller';
import { BehaviorRecordsController } from './controller/behavior-records.controller';
import { BehaviorCategoriesRepository } from './infrastructure/behavior-categories.repository';
import { BehaviorRecordsRepository } from './infrastructure/behavior-records.repository';

@Module({
  imports: [AuthModule],
  controllers: [BehaviorCategoriesController, BehaviorRecordsController],
  providers: [
    BehaviorCategoriesRepository,
    BehaviorRecordsRepository,
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
  ],
})
export class BehaviorModule {}
