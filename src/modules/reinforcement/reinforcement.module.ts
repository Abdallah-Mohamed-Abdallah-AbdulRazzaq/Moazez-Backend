import { Module } from '@nestjs/common';
import { HeroJourneyModule } from './hero-journey/hero-journey.module';
import { OverviewModule } from './overview/overview.module';
import { ReviewsModule } from './reviews/reviews.module';
import { RewardsModule } from './rewards/rewards.module';
import { TasksModule } from './tasks/tasks.module';
import { TemplatesModule } from './templates/templates.module';
import { XpModule } from './xp/xp.module';

@Module({
  imports: [
    OverviewModule,
    TasksModule,
    TemplatesModule,
    ReviewsModule,
    XpModule,
    HeroJourneyModule,
    RewardsModule,
  ],
})
export class ReinforcementModule {}
