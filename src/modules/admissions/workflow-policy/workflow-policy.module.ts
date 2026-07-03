import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { GetAdmissionWorkflowPolicyUseCase } from './application/get-admission-workflow-policy.use-case';
import { ResolveAdmissionWorkflowPolicyService } from './application/resolve-admission-workflow-policy.service';
import { UpdateAdmissionWorkflowPolicyUseCase } from './application/update-admission-workflow-policy.use-case';
import { AdmissionWorkflowPolicyController } from './controller/admission-workflow-policy.controller';
import { AdmissionWorkflowPolicyRepository } from './infrastructure/admission-workflow-policy.repository';

@Module({
  imports: [AuthModule],
  controllers: [AdmissionWorkflowPolicyController],
  providers: [
    AdmissionWorkflowPolicyRepository,
    ResolveAdmissionWorkflowPolicyService,
    GetAdmissionWorkflowPolicyUseCase,
    UpdateAdmissionWorkflowPolicyUseCase,
  ],
  exports: [ResolveAdmissionWorkflowPolicyService],
})
export class WorkflowPolicyModule {}
