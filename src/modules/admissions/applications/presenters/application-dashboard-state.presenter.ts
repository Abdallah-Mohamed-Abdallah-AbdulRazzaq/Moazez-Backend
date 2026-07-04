import {
  AdmissionApplicationStatus,
  AdmissionDecisionType,
  InterviewStatus,
  PlacementTestStatus,
} from '@prisma/client';
import {
  ApplicationDashboardDecisionStateReason,
  ApplicationDashboardStateBlockerCode,
  ApplicationDashboardStateBlockerDto,
  ApplicationDashboardStateDto,
  ApplicationDashboardRegistrationState,
  ApplicationDashboardWorkflowStepReadinessDto,
} from '../dto/application-dashboard-state.dto';
import { ApplicationDocumentsSummaryDto } from '../dto/application.dto';
import { mapApplicationStatusToApi } from '../domain/application.enums';
import { ApplicationRecord } from '../infrastructure/applications.repository';
import { evaluateAdmissionWorkflowPolicy } from '../../workflow-policy/application/admission-workflow-policy.evaluator';
import { ResolvedAdmissionWorkflowPolicy } from '../../workflow-policy/application/resolve-admission-workflow-policy.service';

const DECIDABLE_APPLICATION_STATUSES = [
  AdmissionApplicationStatus.SUBMITTED,
  AdmissionApplicationStatus.UNDER_REVIEW,
] as const;

const BLOCKER_MESSAGES: Record<ApplicationDashboardStateBlockerCode, string> = {
  already_decided: 'Application already has an admissions decision.',
  application_status_not_decidable:
    'Application status does not allow decision creation.',
  workflow_policy_not_satisfied:
    'Required admissions workflow steps are not satisfied.',
  direct_acceptance_not_allowed:
    'Direct acceptance is not allowed by the current workflow policy.',
  not_accepted: 'Application is not accepted.',
  decision_not_accept: 'Application does not have an ACCEPT decision.',
  already_registered: 'Application is already registered.',
};

function addBlocker(
  blockers: ApplicationDashboardStateBlockerDto[],
  code: ApplicationDashboardStateBlockerCode,
): void {
  if (!blockers.some((blocker) => blocker.code === code)) {
    blockers.push({ code, message: BLOCKER_MESSAGES[code] });
  }
}

function isDecidableStatus(status: AdmissionApplicationStatus): boolean {
  return DECIDABLE_APPLICATION_STATUSES.includes(
    status as (typeof DECIDABLE_APPLICATION_STATUSES)[number],
  );
}

function getStepReadiness(params: {
  required: boolean;
  total: number;
  completed: number;
}): ApplicationDashboardWorkflowStepReadinessDto {
  return {
    required: params.required,
    total: params.total,
    completed: params.completed,
    satisfied:
      !params.required ||
      (params.total > 0 && params.total === params.completed),
  };
}

function isDirectAcceptanceBlocked(
  application: ApplicationRecord,
  policy: ResolvedAdmissionWorkflowPolicy,
): boolean {
  const placementTests = countPlacementTests(application);
  const interviews = countInterviews(application);

  const evaluation = evaluateAdmissionWorkflowPolicy({
    applicationId: application.id,
    applicationStatus: mapApplicationStatusToApi(application.status),
    policy,
    decision: AdmissionDecisionType.ACCEPT,
    placementTests,
    interviews,
  });

  return (
    evaluation.details.directAcceptance?.requested === true &&
    evaluation.details.directAcceptance.allowed === false
  );
}

function countPlacementTests(application: ApplicationRecord): {
  total: number;
  completed: number;
} {
  return {
    total: application.placementTests.length,
    completed: application.placementTests.filter(
      (test) => test.status === PlacementTestStatus.COMPLETED,
    ).length,
  };
}

function countInterviews(application: ApplicationRecord): {
  total: number;
  completed: number;
} {
  return {
    total: application.interviews.length,
    completed: application.interviews.filter(
      (interview) => interview.status === InterviewStatus.COMPLETED,
    ).length,
  };
}

function canCreateDecisionType(params: {
  application: ApplicationRecord;
  policy: ResolvedAdmissionWorkflowPolicy;
  decision: AdmissionDecisionType;
}): boolean {
  if (params.application.decision) {
    return false;
  }

  if (!isDecidableStatus(params.application.status)) {
    return false;
  }

  const evaluation = evaluateAdmissionWorkflowPolicy({
    applicationId: params.application.id,
    applicationStatus: mapApplicationStatusToApi(params.application.status),
    policy: params.policy,
    decision: params.decision,
    placementTests: countPlacementTests(params.application),
    interviews: countInterviews(params.application),
  });

  return evaluation.satisfied;
}

function resolveDecisionReason(params: {
  application: ApplicationRecord;
  canCreateDecision: boolean;
  directAcceptanceBlocked: boolean;
}): ApplicationDashboardDecisionStateReason {
  if (params.application.decision) {
    return 'already_decided';
  }

  if (!isDecidableStatus(params.application.status)) {
    return 'application_status_not_decidable';
  }

  if (params.directAcceptanceBlocked) {
    return 'direct_acceptance_not_allowed';
  }

  if (!params.canCreateDecision) {
    return 'workflow_policy_not_satisfied';
  }

  return 'ready';
}

function resolveRegistrationState(params: {
  application: ApplicationRecord;
  workflowSatisfiedForAccept: boolean;
}): ApplicationDashboardRegistrationState {
  if (params.application.student) {
    return 'registered';
  }

  if (params.application.status !== AdmissionApplicationStatus.ACCEPTED) {
    return 'not_accepted';
  }

  if (params.application.decision?.decision !== AdmissionDecisionType.ACCEPT) {
    return 'decision_not_accept';
  }

  if (!params.workflowSatisfiedForAccept) {
    return 'blocked_workflow_policy';
  }

  return 'ready_to_register';
}

export function presentApplicationDashboardState(params: {
  application: ApplicationRecord;
  workflowPolicy: ResolvedAdmissionWorkflowPolicy;
  documentsSummary: ApplicationDocumentsSummaryDto;
}): ApplicationDashboardStateDto {
  const { application, workflowPolicy, documentsSummary } = params;
  const placementTests = countPlacementTests(application);
  const interviews = countInterviews(application);
  const placementTestReadiness = getStepReadiness({
    required: workflowPolicy.requiresPlacementTest,
    ...placementTests,
  });
  const interviewReadiness = getStepReadiness({
    required: workflowPolicy.requiresInterview,
    ...interviews,
  });
  const workflowSatisfiedForAccept = evaluateAdmissionWorkflowPolicy({
    applicationId: application.id,
    applicationStatus: mapApplicationStatusToApi(application.status),
    policy: workflowPolicy,
    decision: AdmissionDecisionType.ACCEPT,
    placementTests,
    interviews,
  }).satisfied;

  const canAccept = canCreateDecisionType({
    application,
    policy: workflowPolicy,
    decision: AdmissionDecisionType.ACCEPT,
  });
  const canWaitlist = canCreateDecisionType({
    application,
    policy: workflowPolicy,
    decision: AdmissionDecisionType.WAITLIST,
  });
  const canReject = canCreateDecisionType({
    application,
    policy: workflowPolicy,
    decision: AdmissionDecisionType.REJECT,
  });
  const canCreateDecision = canAccept || canWaitlist || canReject;
  const directAcceptanceBlocked = isDirectAcceptanceBlocked(
    application,
    workflowPolicy,
  );
  const registrationState = resolveRegistrationState({
    application,
    workflowSatisfiedForAccept,
  });
  const blockers: ApplicationDashboardStateBlockerDto[] = [];

  const decisionReason = resolveDecisionReason({
    application,
    canCreateDecision,
    directAcceptanceBlocked,
  });

  if (decisionReason !== 'ready') {
    addBlocker(blockers, decisionReason);
  }

  if (registrationState === 'registered') {
    addBlocker(blockers, 'already_registered');
  } else if (registrationState === 'not_accepted') {
    addBlocker(blockers, 'not_accepted');
  } else if (registrationState === 'decision_not_accept') {
    addBlocker(blockers, 'decision_not_accept');
  } else if (registrationState === 'blocked_workflow_policy') {
    addBlocker(blockers, 'workflow_policy_not_satisfied');
  }

  return {
    canProceedToDecision: canCreateDecision,
    canRegister: registrationState === 'ready_to_register',
    registrationState,
    decisionState: {
      canCreateDecision,
      canAccept,
      canWaitlist,
      canReject,
      reason: decisionReason,
    },
    workflowReadiness: {
      policy: {
        requiresPlacementTest: workflowPolicy.requiresPlacementTest,
        requiresInterview: workflowPolicy.requiresInterview,
        allowDirectAcceptance: workflowPolicy.allowDirectAcceptance,
        source: workflowPolicy.source,
      },
      placementTests: placementTestReadiness,
      interviews: interviewReadiness,
    },
    documentSignals: {
      hasPendingReview: documentsSummary.hasPendingReview,
      hasReviewableDocuments: documentsSummary.hasReviewableDocuments,
      hasMissingDocuments: documentsSummary.hasMissingDocuments,
      pendingReviewCount: documentsSummary.pendingReviewCount,
      reviewableCount: documentsSummary.reviewableCount,
      missingCount: documentsSummary.missingCount,
      needsReplacementCount: documentsSummary.needsReplacementCount,
    },
    blockers,
  };
}
