import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { CreateReinforcementTaskTemplateUseCase } from './application/create-reinforcement-task-template.use-case';
import { ListReinforcementTemplatesUseCase } from './application/list-reinforcement-templates.use-case';
import { ReinforcementTemplatesController } from './controller/reinforcement-templates.controller';
import { ReinforcementTemplatesRepository } from './infrastructure/reinforcement-templates.repository';

@Module({
  imports: [AuthModule],
  controllers: [ReinforcementTemplatesController],
  providers: [
    ReinforcementTemplatesRepository,
    ListReinforcementTemplatesUseCase,
    CreateReinforcementTaskTemplateUseCase,
  ],
})
export class TemplatesModule {}
