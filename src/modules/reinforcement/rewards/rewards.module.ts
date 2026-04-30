import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import {
  ArchiveRewardCatalogItemUseCase,
  CreateRewardCatalogItemUseCase,
  GetRewardCatalogItemUseCase,
  ListRewardCatalogUseCase,
  PublishRewardCatalogItemUseCase,
  UpdateRewardCatalogItemUseCase,
} from './application/reward-catalog.use-cases';
import {
  GetRewardCatalogSummaryUseCase,
  GetRewardsOverviewUseCase,
  GetStudentRewardsSummaryUseCase,
} from './application/reward-dashboard.use-cases';
import {
  ApproveRewardRedemptionUseCase,
  CancelRewardRedemptionUseCase,
  CreateRewardRedemptionUseCase,
  FulfillRewardRedemptionUseCase,
  GetRewardRedemptionUseCase,
  ListRewardRedemptionsUseCase,
  RejectRewardRedemptionUseCase,
} from './application/reward-redemptions.use-cases';
import { RewardCatalogController } from './controller/reward-catalog.controller';
import { RewardDashboardController } from './controller/reward-dashboard.controller';
import { RewardRedemptionsController } from './controller/reward-redemptions.controller';
import { RewardCatalogRepository } from './infrastructure/reward-catalog.repository';
import { RewardDashboardRepository } from './infrastructure/reward-dashboard.repository';
import { RewardRedemptionsRepository } from './infrastructure/reward-redemptions.repository';

@Module({
  imports: [AuthModule],
  controllers: [
    RewardDashboardController,
    RewardCatalogController,
    RewardRedemptionsController,
  ],
  providers: [
    RewardCatalogRepository,
    RewardDashboardRepository,
    RewardRedemptionsRepository,
    ListRewardCatalogUseCase,
    GetRewardCatalogItemUseCase,
    CreateRewardCatalogItemUseCase,
    UpdateRewardCatalogItemUseCase,
    PublishRewardCatalogItemUseCase,
    ArchiveRewardCatalogItemUseCase,
    ListRewardRedemptionsUseCase,
    GetRewardRedemptionUseCase,
    CreateRewardRedemptionUseCase,
    CancelRewardRedemptionUseCase,
    ApproveRewardRedemptionUseCase,
    RejectRewardRedemptionUseCase,
    FulfillRewardRedemptionUseCase,
    GetRewardsOverviewUseCase,
    GetStudentRewardsSummaryUseCase,
    GetRewardCatalogSummaryUseCase,
  ],
})
export class RewardsModule {}
