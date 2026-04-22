import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { ApplicationsModule } from '../applications/applications.module';
import { CreateAdmissionDecisionUseCase } from './application/create-admission-decision.use-case';
import { GetAdmissionDecisionUseCase } from './application/get-admission-decision.use-case';
import { ListAdmissionDecisionsUseCase } from './application/list-admission-decisions.use-case';
import { AdmissionDecisionsController } from './controller/admission-decisions.controller';
import { AdmissionDecisionsRepository } from './infrastructure/admission-decisions.repository';
import { DecisionWorkflowValidator } from './validators/decision-workflow.validator';

@Module({
  imports: [ApplicationsModule, AuthModule],
  controllers: [AdmissionDecisionsController],
  providers: [
    AdmissionDecisionsRepository,
    DecisionWorkflowValidator,
    ListAdmissionDecisionsUseCase,
    CreateAdmissionDecisionUseCase,
    GetAdmissionDecisionUseCase,
  ],
})
export class DecisionsModule {}
