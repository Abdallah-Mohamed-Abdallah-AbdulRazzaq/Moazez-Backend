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
import { RewardCatalogController } from './controller/reward-catalog.controller';
import { RewardCatalogRepository } from './infrastructure/reward-catalog.repository';

@Module({
  imports: [AuthModule],
  controllers: [RewardCatalogController],
  providers: [
    RewardCatalogRepository,
    ListRewardCatalogUseCase,
    GetRewardCatalogItemUseCase,
    CreateRewardCatalogItemUseCase,
    UpdateRewardCatalogItemUseCase,
    PublishRewardCatalogItemUseCase,
    ArchiveRewardCatalogItemUseCase,
  ],
})
export class RewardsModule {}
