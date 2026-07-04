export type ApplicationDashboardStateBlockerCode =
  | 'already_decided'
  | 'application_status_not_decidable'
  | 'workflow_policy_not_satisfied'
  | 'direct_acceptance_not_allowed'
  | 'not_accepted'
  | 'decision_not_accept'
  | 'already_registered';

export type ApplicationDashboardDecisionStateReason =
  | 'ready'
  | 'already_decided'
  | 'application_status_not_decidable'
  | 'workflow_policy_not_satisfied'
  | 'direct_acceptance_not_allowed';

export type ApplicationDashboardRegistrationState =
  | 'not_applicable'
  | 'not_accepted'
  | 'decision_not_accept'
  | 'blocked_workflow_policy'
  | 'ready_to_register'
  | 'registered';

export class ApplicationDashboardStateBlockerDto {
  code!: ApplicationDashboardStateBlockerCode;
  message!: string;
}

export class ApplicationDashboardWorkflowStepReadinessDto {
  required!: boolean;
  total!: number;
  completed!: number;
  satisfied!: boolean;
}

export class ApplicationDashboardWorkflowPolicyDto {
  requiresPlacementTest!: boolean;
  requiresInterview!: boolean;
  allowDirectAcceptance!: boolean;
  source!: 'default' | 'school_override';
}

export class ApplicationDashboardWorkflowReadinessDto {
  policy!: ApplicationDashboardWorkflowPolicyDto;
  placementTests!: ApplicationDashboardWorkflowStepReadinessDto;
  interviews!: ApplicationDashboardWorkflowStepReadinessDto;
}

export class ApplicationDashboardDecisionStateDto {
  canCreateDecision!: boolean;
  canAccept!: boolean;
  canWaitlist!: boolean;
  canReject!: boolean;
  reason!: ApplicationDashboardDecisionStateReason;
}

export class ApplicationDashboardDocumentSignalsDto {
  hasPendingReview!: boolean;
  hasReviewableDocuments!: boolean;
  hasMissingDocuments!: boolean;
  pendingReviewCount!: number;
  reviewableCount!: number;
  missingCount!: number;
  needsReplacementCount!: number;
}

export class ApplicationDashboardStateDto {
  canProceedToDecision!: boolean;
  canRegister!: boolean;
  registrationState!: ApplicationDashboardRegistrationState;
  decisionState!: ApplicationDashboardDecisionStateDto;
  workflowReadiness!: ApplicationDashboardWorkflowReadinessDto;
  documentSignals!: ApplicationDashboardDocumentSignalsDto;
  blockers!: ApplicationDashboardStateBlockerDto[];
}
