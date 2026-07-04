import {
  AdmissionApplicationSource,
  AdmissionApplicationStatus,
  AdmissionDecisionType,
  AdmissionDocumentStatus,
  InterviewStatus,
  PlacementTestStatus,
  StudentEnrollmentStatus,
} from '@prisma/client';
import { ApplicationDocumentsSummaryDto } from '../dto/application.dto';
import { ApplicationRecord } from '../infrastructure/applications.repository';
import { presentApplicationDashboardState } from '../presenters/application-dashboard-state.presenter';
import {
  DEFAULT_ADMISSION_WORKFLOW_POLICY,
  ResolvedAdmissionWorkflowPolicy,
} from '../../workflow-policy/application/resolve-admission-workflow-policy.service';

describe('Application dashboard state presenter', () => {
  const emptyDocumentsSummary: ApplicationDocumentsSummaryDto = {
    totalCount: 0,
    completeCount: 0,
    missingCount: 0,
    pendingReviewCount: 0,
    reviewableCount: 0,
    applicantPortalCount: 0,
    staffUploadCount: 0,
    needsReplacementCount: 0,
    hasPendingReview: false,
    hasReviewableDocuments: false,
    hasMissingDocuments: false,
  };

  function policy(
    overrides?: Partial<ResolvedAdmissionWorkflowPolicy>,
  ): ResolvedAdmissionWorkflowPolicy {
    return {
      id: null,
      ...DEFAULT_ADMISSION_WORKFLOW_POLICY,
      source: 'default',
      updatedAt: null,
      ...overrides,
    };
  }

  function buildApplication(
    overrides?: Partial<ApplicationRecord>,
  ): ApplicationRecord {
    return {
      id: 'application-1',
      schoolId: 'school-1',
      organizationId: 'org-1',
      leadId: null,
      studentName: 'Layla Hassan',
      requestedAcademicYearId: null,
      requestedGradeId: null,
      source: AdmissionApplicationSource.IN_APP,
      status: AdmissionApplicationStatus.SUBMITTED,
      submittedAt: new Date('2026-04-21T10:00:00.000Z'),
      createdAt: new Date('2026-04-21T09:00:00.000Z'),
      updatedAt: new Date('2026-04-21T11:00:00.000Z'),
      deletedAt: null,
      decision: null,
      placementTests: [],
      interviews: [],
      documents: [],
      student: null,
      ...overrides,
    };
  }

  function placementTest(status: PlacementTestStatus) {
    return { status };
  }

  function interview(status: InterviewStatus) {
    return { status };
  }

  function dashboardState(params?: {
    application?: Partial<ApplicationRecord>;
    workflowPolicy?: Partial<ResolvedAdmissionWorkflowPolicy>;
    documentsSummary?: Partial<ApplicationDocumentsSummaryDto>;
  }) {
    return presentApplicationDashboardState({
      application: buildApplication(params?.application),
      workflowPolicy: policy(params?.workflowPolicy),
      documentsSummary: {
        ...emptyDocumentsSummary,
        ...params?.documentsSummary,
      },
    });
  }

  it('blocks decision readiness under default strict policy when workflow steps are missing', () => {
    const state = dashboardState();

    expect(state.canProceedToDecision).toBe(false);
    expect(state.decisionState).toEqual({
      canCreateDecision: false,
      canAccept: false,
      canWaitlist: false,
      canReject: false,
      reason: 'workflow_policy_not_satisfied',
    });
    expect(state.workflowReadiness).toEqual({
      policy: {
        requiresPlacementTest: true,
        requiresInterview: true,
        allowDirectAcceptance: false,
        source: 'default',
      },
      placementTests: {
        required: true,
        total: 0,
        completed: 0,
        satisfied: false,
      },
      interviews: {
        required: true,
        total: 0,
        completed: 0,
        satisfied: false,
      },
    });
    expect(state.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'workflow_policy_not_satisfied' }),
        expect.objectContaining({ code: 'not_accepted' }),
      ]),
    );
  });

  it('allows all decision actions when required workflow steps are completed', () => {
    const state = dashboardState({
      application: {
        placementTests: [placementTest(PlacementTestStatus.COMPLETED)],
        interviews: [interview(InterviewStatus.COMPLETED)],
      },
    });

    expect(state.canProceedToDecision).toBe(true);
    expect(state.decisionState).toEqual({
      canCreateDecision: true,
      canAccept: true,
      canWaitlist: true,
      canReject: true,
      reason: 'ready',
    });
    expect(state.blockers).toEqual([
      { code: 'not_accepted', message: 'Application is not accepted.' },
    ]);
  });

  it('applies decision reason precedence for already decided and non-decidable applications', () => {
    const alreadyDecided = dashboardState({
      application: {
        decision: { decision: AdmissionDecisionType.WAITLIST },
        placementTests: [placementTest(PlacementTestStatus.COMPLETED)],
        interviews: [interview(InterviewStatus.COMPLETED)],
      },
    });
    const nonDecidable = dashboardState({
      application: {
        status: AdmissionApplicationStatus.ACCEPTED,
        placementTests: [placementTest(PlacementTestStatus.COMPLETED)],
        interviews: [interview(InterviewStatus.COMPLETED)],
      },
    });

    expect(alreadyDecided.decisionState.reason).toBe('already_decided');
    expect(alreadyDecided.canProceedToDecision).toBe(false);
    expect(nonDecidable.decisionState.reason).toBe(
      'application_status_not_decidable',
    );
    expect(nonDecidable.canProceedToDecision).toBe(false);
  });

  it('reflects optional placement/interview policy and policy source', () => {
    const placementOptional = dashboardState({
      application: {
        interviews: [interview(InterviewStatus.COMPLETED)],
      },
      workflowPolicy: {
        requiresPlacementTest: false,
        source: 'school_override',
      },
    });
    const interviewOptional = dashboardState({
      application: {
        placementTests: [placementTest(PlacementTestStatus.COMPLETED)],
      },
      workflowPolicy: {
        requiresInterview: false,
        source: 'school_override',
      },
    });

    expect(placementOptional.canProceedToDecision).toBe(true);
    expect(placementOptional.workflowReadiness.policy.source).toBe(
      'school_override',
    );
    expect(placementOptional.workflowReadiness.placementTests.satisfied).toBe(
      true,
    );
    expect(interviewOptional.canProceedToDecision).toBe(true);
    expect(interviewOptional.workflowReadiness.interviews.satisfied).toBe(true);
  });

  it('reflects direct acceptance policy without broadening waitlist/reject semantics', () => {
    const directAllowed = dashboardState({
      workflowPolicy: {
        requiresPlacementTest: false,
        requiresInterview: false,
        allowDirectAcceptance: true,
      },
    });
    const directBlocked = dashboardState({
      workflowPolicy: {
        requiresPlacementTest: false,
        requiresInterview: false,
        allowDirectAcceptance: false,
      },
    });

    expect(directAllowed.decisionState).toEqual({
      canCreateDecision: true,
      canAccept: true,
      canWaitlist: true,
      canReject: true,
      reason: 'ready',
    });
    expect(directBlocked.decisionState).toEqual({
      canCreateDecision: true,
      canAccept: false,
      canWaitlist: true,
      canReject: true,
      reason: 'direct_acceptance_not_allowed',
    });
    expect(directBlocked.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'direct_acceptance_not_allowed' }),
      ]),
    );
  });

  it('resolves registration state precedence', () => {
    const notAccepted = dashboardState();
    const decisionNotAccept = dashboardState({
      application: {
        status: AdmissionApplicationStatus.ACCEPTED,
        decision: { decision: AdmissionDecisionType.WAITLIST },
        placementTests: [placementTest(PlacementTestStatus.COMPLETED)],
        interviews: [interview(InterviewStatus.COMPLETED)],
      },
    });
    const blockedWorkflow = dashboardState({
      application: {
        status: AdmissionApplicationStatus.ACCEPTED,
        decision: { decision: AdmissionDecisionType.ACCEPT },
      },
    });
    const ready = dashboardState({
      application: {
        status: AdmissionApplicationStatus.ACCEPTED,
        decision: { decision: AdmissionDecisionType.ACCEPT },
        placementTests: [placementTest(PlacementTestStatus.COMPLETED)],
        interviews: [interview(InterviewStatus.COMPLETED)],
      },
    });
    const registered = dashboardState({
      application: {
        status: AdmissionApplicationStatus.SUBMITTED,
        student: {
          id: 'student-1',
          enrollments: [
            {
              id: 'enrollment-1',
              status: StudentEnrollmentStatus.ACTIVE,
            },
          ],
        },
      },
    });

    expect(notAccepted.registrationState).toBe('not_accepted');
    expect(decisionNotAccept.registrationState).toBe('decision_not_accept');
    expect(blockedWorkflow.registrationState).toBe('blocked_workflow_policy');
    expect(ready.registrationState).toBe('ready_to_register');
    expect(ready.canRegister).toBe(true);
    expect(registered.registrationState).toBe('registered');
    expect(registered.canRegister).toBe(false);
  });

  it('derives document signals from documentsSummary only', () => {
    const state = dashboardState({
      documentsSummary: {
        pendingReviewCount: 2,
        reviewableCount: 1,
        missingCount: 3,
        needsReplacementCount: 1,
        hasPendingReview: true,
        hasReviewableDocuments: true,
        hasMissingDocuments: true,
      },
    });

    expect(state.documentSignals).toEqual({
      hasPendingReview: true,
      hasReviewableDocuments: true,
      hasMissingDocuments: true,
      pendingReviewCount: 2,
      reviewableCount: 1,
      missingCount: 3,
      needsReplacementCount: 1,
    });
  });

  it('does not expose internal ids, raw enum names, or mutable workflow rows', () => {
    const state = dashboardState({
      application: {
        status: AdmissionApplicationStatus.ACCEPTED,
        decision: { decision: AdmissionDecisionType.ACCEPT },
        placementTests: [placementTest(PlacementTestStatus.COMPLETED)],
        interviews: [interview(InterviewStatus.COMPLETED)],
      },
      workflowPolicy: {
        id: 'policy-1',
        source: 'school_override',
        updatedAt: new Date('2026-07-04T08:00:00.000Z'),
      },
    });
    const serialized = JSON.stringify(state);

    for (const forbidden of [
      'application-1',
      'policy-1',
      'schoolId',
      'organizationId',
      'studentId',
      'placementTestId',
      'interviewId',
      'decisionId',
      'createdAt',
      'updatedAt',
      'SUBMITTED',
      'ACCEPTED',
      'COMPLETED',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
