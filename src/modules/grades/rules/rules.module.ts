import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { GetEffectiveGradeRuleUseCase } from './application/get-effective-grade-rule.use-case';
import { ListGradeRulesUseCase } from './application/list-grade-rules.use-case';
import { UpdateGradeRuleUseCase } from './application/update-grade-rule.use-case';
import { UpsertGradeRuleUseCase } from './application/upsert-grade-rule.use-case';
import { GradesRulesController } from './controller/grades-rules.controller';
import { GradesRulesRepository } from './infrastructure/grades-rules.repository';

@Module({
  imports: [AuthModule],
  controllers: [GradesRulesController],
  providers: [
    GradesRulesRepository,
    ListGradeRulesUseCase,
    GetEffectiveGradeRuleUseCase,
    UpsertGradeRuleUseCase,
    UpdateGradeRuleUseCase,
  ],
})
export class RulesModule {}
