import { AdmissionWorkflowPolicyResponseDto } from '../dto/admission-workflow-policy.dto';
import { ResolvedAdmissionWorkflowPolicy } from '../application/resolve-admission-workflow-policy.service';

export function presentAdmissionWorkflowPolicy(
  policy: ResolvedAdmissionWorkflowPolicy,
): AdmissionWorkflowPolicyResponseDto {
  return {
    requiresPlacementTest: policy.requiresPlacementTest,
    requiresInterview: policy.requiresInterview,
    allowDirectAcceptance: policy.allowDirectAcceptance,
    source: policy.source,
    updatedAt: policy.updatedAt ? policy.updatedAt.toISOString() : null,
  };
}
