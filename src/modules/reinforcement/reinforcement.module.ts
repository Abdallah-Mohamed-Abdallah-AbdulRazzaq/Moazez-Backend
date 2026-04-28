import { Module } from '@nestjs/common';
import { TasksModule } from './tasks/tasks.module';
import { TemplatesModule } from './templates/templates.module';

@Module({
  imports: [TasksModule, TemplatesModule],
})
export class ReinforcementModule {}
