import { ApiProperty } from '@nestjs/swagger';

const APPLICATION_DASHBOARD_STATE_BLOCKER_CODES = [
  'already_decided',
  'application_status_not_decidable',
  'workflow_policy_not_satisfied',
  'direct_acceptance_not_allowed',
  'not_accepted',
  'decision_not_accept',
  'already_registered',
] as const;

const APPLICATION_DASHBOARD_DECISION_STATE_REASONS = [
  'ready',
  'already_decided',
  'application_status_not_decidable',
  'workflow_policy_not_satisfied',
  'direct_acceptance_not_allowed',
] as const;

const APPLICATION_DASHBOARD_REGISTRATION_STATES = [
  'not_applicable',
  'not_accepted',
  'decision_not_accept',
  'blocked_workflow_policy',
  'ready_to_register',
  'registered',
] as const;

const APPLICATION_DASHBOARD_WORKFLOW_POLICY_SOURCES = [
  'default',
  'school_override',
] as const;

export type ApplicationDashboardStateBlockerCode =
  (typeof APPLICATION_DASHBOARD_STATE_BLOCKER_CODES)[number];

export type ApplicationDashboardDecisionStateReason =
  (typeof APPLICATION_DASHBOARD_DECISION_STATE_REASONS)[number];

export type ApplicationDashboardRegistrationState =
  (typeof APPLICATION_DASHBOARD_REGISTRATION_STATES)[number];

export class ApplicationDashboardStateBlockerDto {
  @ApiProperty({
    enum: APPLICATION_DASHBOARD_STATE_BLOCKER_CODES,
    example: 'workflow_policy_not_satisfied',
  })
  code!: ApplicationDashboardStateBlockerCode;

  @ApiProperty({
    example: 'Required admissions workflow steps are not satisfied.',
  })
  message!: string;
}

export class ApplicationDashboardWorkflowStepReadinessDto {
  @ApiProperty({ example: true })
  required!: boolean;

  @ApiProperty({ example: 1 })
  total!: number;

  @ApiProperty({ example: 1 })
  completed!: number;

  @ApiProperty({ example: true })
  satisfied!: boolean;
}

export class ApplicationDashboardWorkflowPolicyDto {
  @ApiProperty({ example: true })
  requiresPlacementTest!: boolean;

  @ApiProperty({ example: true })
  requiresInterview!: boolean;

  @ApiProperty({ example: false })
  allowDirectAcceptance!: boolean;

  @ApiProperty({
    enum: APPLICATION_DASHBOARD_WORKFLOW_POLICY_SOURCES,
    example: 'default',
  })
  source!: 'default' | 'school_override';
}

export class ApplicationDashboardWorkflowReadinessDto {
  @ApiProperty({ type: ApplicationDashboardWorkflowPolicyDto })
  policy!: ApplicationDashboardWorkflowPolicyDto;

  @ApiProperty({ type: ApplicationDashboardWorkflowStepReadinessDto })
  placementTests!: ApplicationDashboardWorkflowStepReadinessDto;

  @ApiProperty({ type: ApplicationDashboardWorkflowStepReadinessDto })
  interviews!: ApplicationDashboardWorkflowStepReadinessDto;
}

export class ApplicationDashboardDecisionStateDto {
  @ApiProperty({ example: true })
  canCreateDecision!: boolean;

  @ApiProperty({ example: true })
  canAccept!: boolean;

  @ApiProperty({ example: true })
  canWaitlist!: boolean;

  @ApiProperty({ example: true })
  canReject!: boolean;

  @ApiProperty({
    enum: APPLICATION_DASHBOARD_DECISION_STATE_REASONS,
    example: 'ready',
  })
  reason!: ApplicationDashboardDecisionStateReason;
}

export class ApplicationDashboardDocumentSignalsDto {
  @ApiProperty({ example: true })
  hasPendingReview!: boolean;

  @ApiProperty({ example: true })
  hasReviewableDocuments!: boolean;

  @ApiProperty({ example: false })
  hasMissingDocuments!: boolean;

  @ApiProperty({ example: 1 })
  pendingReviewCount!: number;

  @ApiProperty({ example: 1 })
  reviewableCount!: number;

  @ApiProperty({ example: 0 })
  missingCount!: number;

  @ApiProperty({ example: 0 })
  needsReplacementCount!: number;
}

export class ApplicationDashboardStateDto {
  @ApiProperty({ example: true })
  canProceedToDecision!: boolean;

  @ApiProperty({ example: false })
  canRegister!: boolean;

  @ApiProperty({
    enum: APPLICATION_DASHBOARD_REGISTRATION_STATES,
    example: 'not_accepted',
  })
  registrationState!: ApplicationDashboardRegistrationState;

  @ApiProperty({ type: ApplicationDashboardDecisionStateDto })
  decisionState!: ApplicationDashboardDecisionStateDto;

  @ApiProperty({ type: ApplicationDashboardWorkflowReadinessDto })
  workflowReadiness!: ApplicationDashboardWorkflowReadinessDto;

  @ApiProperty({ type: ApplicationDashboardDocumentSignalsDto })
  documentSignals!: ApplicationDashboardDocumentSignalsDto;

  @ApiProperty({ type: [ApplicationDashboardStateBlockerDto] })
  blockers!: ApplicationDashboardStateBlockerDto[];
}
