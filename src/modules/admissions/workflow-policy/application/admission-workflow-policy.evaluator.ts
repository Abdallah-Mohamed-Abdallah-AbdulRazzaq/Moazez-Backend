import { AdmissionDecisionType } from '@prisma/client';
import { ApplicationStatusApiValue } from '../../applications/domain/application.enums';
import { AdmissionWorkflowPolicySettings } from './resolve-admission-workflow-policy.service';

export interface AdmissionsWorkflowStepCounts {
  total: number;
  completed: number;
}

export interface AdmissionsWorkflowStepEvaluation
  extends AdmissionsWorkflowStepCounts {
  required: boolean;
  satisfied: boolean;
}

export interface AdmissionWorkflowValidationDetails
  extends Record<string, unknown> {
  applicationId: string;
  applicationStatus: ApplicationStatusApiValue;
  policy: AdmissionWorkflowPolicySettings;
  placementTests: AdmissionsWorkflowStepEvaluation;
  interviews: AdmissionsWorkflowStepEvaluation;
  directAcceptance?: {
    requested: boolean;
    allowed: boolean;
  };
}

export interface AdmissionWorkflowPolicyEvaluation {
  satisfied: boolean;
  details: AdmissionWorkflowValidationDetails;
}

function evaluateStep(params: {
  required: boolean;
  counts: AdmissionsWorkflowStepCounts;
}): AdmissionsWorkflowStepEvaluation {
  return {
    required: params.required,
    total: params.counts.total,
    completed: params.counts.completed,
    satisfied:
      !params.required ||
      (params.counts.total > 0 && params.counts.total === params.counts.completed),
  };
}

export function evaluateAdmissionWorkflowPolicy(params: {
  applicationId: string;
  applicationStatus: ApplicationStatusApiValue;
  policy: AdmissionWorkflowPolicySettings;
  decision?: AdmissionDecisionType;
  placementTests: AdmissionsWorkflowStepCounts;
  interviews: AdmissionsWorkflowStepCounts;
}): AdmissionWorkflowPolicyEvaluation {
  const placementTests = evaluateStep({
    required: params.policy.requiresPlacementTest,
    counts: params.placementTests,
  });
  const interviews = evaluateStep({
    required: params.policy.requiresInterview,
    counts: params.interviews,
  });
  const isAcceptDecision = params.decision === AdmissionDecisionType.ACCEPT;
  const directAcceptanceApplies =
    isAcceptDecision &&
    !params.policy.requiresPlacementTest &&
    !params.policy.requiresInterview;
  const directAcceptance = directAcceptanceApplies
    ? {
        requested:
          params.placementTests.total === 0 && params.interviews.total === 0,
        allowed: params.policy.allowDirectAcceptance,
      }
    : undefined;
  const directAcceptanceBlocked =
    directAcceptance?.requested === true && directAcceptance.allowed === false;

  const details: AdmissionWorkflowValidationDetails = {
    applicationId: params.applicationId,
    applicationStatus: params.applicationStatus,
    policy: {
      requiresPlacementTest: params.policy.requiresPlacementTest,
      requiresInterview: params.policy.requiresInterview,
      allowDirectAcceptance: params.policy.allowDirectAcceptance,
    },
    placementTests,
    interviews,
    ...(directAcceptance ? { directAcceptance } : {}),
  };

  return {
    satisfied:
      placementTests.satisfied &&
      interviews.satisfied &&
      !directAcceptanceBlocked,
    details,
  };
}
