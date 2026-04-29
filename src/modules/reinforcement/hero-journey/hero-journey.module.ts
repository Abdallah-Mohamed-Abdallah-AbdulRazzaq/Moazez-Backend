import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import {
  CreateHeroBadgeUseCase,
  DeleteHeroBadgeUseCase,
  GetHeroBadgeUseCase,
  ListHeroBadgesUseCase,
  UpdateHeroBadgeUseCase,
} from './application/badge-catalog.use-cases';
import {
  ArchiveHeroMissionUseCase,
  CreateHeroMissionUseCase,
  DeleteHeroMissionUseCase,
  GetHeroMissionUseCase,
  ListHeroMissionsUseCase,
  PublishHeroMissionUseCase,
  UpdateHeroMissionUseCase,
} from './application/hero-mission.use-cases';
import {
  CompleteHeroMissionUseCase,
  CompleteHeroObjectiveUseCase,
  GetHeroProgressDetailUseCase,
  GetStudentHeroProgressUseCase,
  StartHeroMissionUseCase,
} from './application/hero-journey-progress.use-cases';
import {
  AwardHeroMissionBadgeUseCase,
  GetStudentHeroRewardsUseCase,
  GrantHeroMissionXpUseCase,
} from './application/hero-journey-rewards.use-cases';
import { HeroJourneyController } from './controller/hero-journey.controller';
import { HeroJourneyProgressController } from './controller/hero-journey-progress.controller';
import { HeroJourneyRewardsController } from './controller/hero-journey-rewards.controller';
import { HeroJourneyRepository } from './infrastructure/hero-journey.repository';
import { HeroJourneyProgressRepository } from './infrastructure/hero-journey-progress.repository';
import { HeroJourneyRewardsRepository } from './infrastructure/hero-journey-rewards.repository';

@Module({
  imports: [AuthModule],
  controllers: [
    HeroJourneyController,
    HeroJourneyProgressController,
    HeroJourneyRewardsController,
  ],
  providers: [
    HeroJourneyRepository,
    HeroJourneyProgressRepository,
    HeroJourneyRewardsRepository,
    ListHeroBadgesUseCase,
    GetHeroBadgeUseCase,
    CreateHeroBadgeUseCase,
    UpdateHeroBadgeUseCase,
    DeleteHeroBadgeUseCase,
    ListHeroMissionsUseCase,
    GetHeroMissionUseCase,
    CreateHeroMissionUseCase,
    UpdateHeroMissionUseCase,
    PublishHeroMissionUseCase,
    ArchiveHeroMissionUseCase,
    DeleteHeroMissionUseCase,
    GetStudentHeroProgressUseCase,
    GetHeroProgressDetailUseCase,
    StartHeroMissionUseCase,
    CompleteHeroObjectiveUseCase,
    CompleteHeroMissionUseCase,
    GrantHeroMissionXpUseCase,
    AwardHeroMissionBadgeUseCase,
    GetStudentHeroRewardsUseCase,
  ],
})
export class HeroJourneyModule {}
