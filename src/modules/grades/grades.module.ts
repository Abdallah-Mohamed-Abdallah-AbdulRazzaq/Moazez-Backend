import { Module } from '@nestjs/common';
import { AnalyticsModule } from './analytics/analytics.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { GradebookModule } from './gradebook/gradebook.module';
import { RulesModule } from './rules/rules.module';

@Module({
  imports: [AssessmentsModule, RulesModule, GradebookModule, AnalyticsModule],
})
export class GradesModule {}
