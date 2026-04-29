import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { CreateXpPolicyUseCase } from './application/create-xp-policy.use-case';
import { GetEffectiveXpPolicyUseCase } from './application/get-effective-xp-policy.use-case';
import { GetXpSummaryUseCase } from './application/get-xp-summary.use-case';
import { GrantManualXpUseCase } from './application/grant-manual-xp.use-case';
import { GrantXpForReinforcementReviewUseCase } from './application/grant-xp-for-reinforcement-review.use-case';
import { ListXpLedgerUseCase } from './application/list-xp-ledger.use-case';
import { ListXpPoliciesUseCase } from './application/list-xp-policies.use-case';
import { UpdateXpPolicyUseCase } from './application/update-xp-policy.use-case';
import { ReinforcementXpController } from './controller/reinforcement-xp.controller';
import { ReinforcementXpRepository } from './infrastructure/reinforcement-xp.repository';

@Module({
  imports: [AuthModule],
  controllers: [ReinforcementXpController],
  providers: [
    ReinforcementXpRepository,
    ListXpPoliciesUseCase,
    GetEffectiveXpPolicyUseCase,
    CreateXpPolicyUseCase,
    UpdateXpPolicyUseCase,
    ListXpLedgerUseCase,
    GetXpSummaryUseCase,
    GrantXpForReinforcementReviewUseCase,
    GrantManualXpUseCase,
  ],
})
export class XpModule {}
