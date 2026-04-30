import { Module } from '@nestjs/common';
import { AuthModule } from '../iam/auth/auth.module';
import {
  CreateBehaviorCategoryUseCase,
  DeleteBehaviorCategoryUseCase,
  GetBehaviorCategoryUseCase,
  ListBehaviorCategoriesUseCase,
  UpdateBehaviorCategoryUseCase,
} from './application/behavior-categories.use-cases';
import { BehaviorCategoriesController } from './controller/behavior-categories.controller';
import { BehaviorCategoriesRepository } from './infrastructure/behavior-categories.repository';

@Module({
  imports: [AuthModule],
  controllers: [BehaviorCategoriesController],
  providers: [
    BehaviorCategoriesRepository,
    ListBehaviorCategoriesUseCase,
    GetBehaviorCategoryUseCase,
    CreateBehaviorCategoryUseCase,
    UpdateBehaviorCategoryUseCase,
    DeleteBehaviorCategoryUseCase,
  ],
})
export class BehaviorModule {}
