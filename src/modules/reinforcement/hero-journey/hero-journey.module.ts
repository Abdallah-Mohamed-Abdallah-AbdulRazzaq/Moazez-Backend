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
import { HeroJourneyController } from './controller/hero-journey.controller';
import { HeroJourneyRepository } from './infrastructure/hero-journey.repository';

@Module({
  imports: [AuthModule],
  controllers: [HeroJourneyController],
  providers: [
    HeroJourneyRepository,
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
  ],
})
export class HeroJourneyModule {}
