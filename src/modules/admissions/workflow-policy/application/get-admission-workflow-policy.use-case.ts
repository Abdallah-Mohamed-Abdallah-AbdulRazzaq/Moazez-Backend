import { Injectable } from '@nestjs/common';
import { AdmissionWorkflowPolicyResponseDto } from '../dto/admission-workflow-policy.dto';
import { presentAdmissionWorkflowPolicy } from '../presenters/admission-workflow-policy.presenter';
import { ResolveAdmissionWorkflowPolicyService } from './resolve-admission-workflow-policy.service';

@Injectable()
export class GetAdmissionWorkflowPolicyUseCase {
  constructor(
    private readonly resolveAdmissionWorkflowPolicyService: ResolveAdmissionWorkflowPolicyService,
  ) {}

  async execute(): Promise<AdmissionWorkflowPolicyResponseDto> {
    const policy =
      await this.resolveAdmissionWorkflowPolicyService.resolveForCurrentSchool();

    return presentAdmissionWorkflowPolicy(policy);
  }
}
