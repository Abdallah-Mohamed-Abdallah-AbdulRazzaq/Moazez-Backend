import { Module } from '@nestjs/common';
import { ReviewsModule } from './reviews/reviews.module';
import { TasksModule } from './tasks/tasks.module';
import { TemplatesModule } from './templates/templates.module';

@Module({
  imports: [TasksModule, TemplatesModule, ReviewsModule],
})
export class ReinforcementModule {}
