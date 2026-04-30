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
  ApproveRewardRedemptionUseCase,
  CancelRewardRedemptionUseCase,
  CreateRewardRedemptionUseCase,
  FulfillRewardRedemptionUseCase,
  GetRewardRedemptionUseCase,
  ListRewardRedemptionsUseCase,
  RejectRewardRedemptionUseCase,
} from './application/reward-redemptions.use-cases';
import { RewardCatalogController } from './controller/reward-catalog.controller';
import { RewardRedemptionsController } from './controller/reward-redemptions.controller';
import { RewardCatalogRepository } from './infrastructure/reward-catalog.repository';
import { RewardRedemptionsRepository } from './infrastructure/reward-redemptions.repository';

@Module({
  imports: [AuthModule],
  controllers: [RewardCatalogController, RewardRedemptionsController],
  providers: [
    RewardCatalogRepository,
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
  ],
})
export class RewardsModule {}
