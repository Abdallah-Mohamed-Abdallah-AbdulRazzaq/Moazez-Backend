import {
  AdmissionApplicationStatus,
  AdmissionDecisionType,
  AuditOutcome,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { ApplicationsRepository } from '../../applications/infrastructure/applications.repository';
import {
  AdmissionWorkflowPolicySettings,
  DEFAULT_ADMISSION_WORKFLOW_POLICY,
  ResolveAdmissionWorkflowPolicyService,
} from '../../workflow-policy/application/resolve-admission-workflow-policy.service';
import { CreateAdmissionDecisionUseCase } from '../application/create-admission-decision.use-case';
import {
  ApplicationAlreadyDecidedException,
  DecisionRequiresAllStepsException,
} from '../domain/admission-decision.exceptions';
import { AdmissionDecisionsRepository } from '../infrastructure/admission-decisions.repository';
import { presentAdmissionDecision } from '../presenters/admission-decision.presenter';
import { DecisionWorkflowValidator } from '../validators/decision-workflow.validator';

type AdmissionDecisionStoreItem = {
  id: string;
  schoolId: string;
  applicationId: string;
  decision: AdmissionDecisionType;
  reason: string | null;
  decidedByUserId: string;
  decidedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  application: {
    id: string;
    studentName: string;
    status: AdmissionApplicationStatus;
  };
  decidedByUser: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
};

describe('Admission decisions use cases', () => {
  async function withScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['admissions.decisions.view', 'admissions.decisions.manage'],
      });

      return fn();
    });
  }

  function createApplicationsRepository(
    status: AdmissionApplicationStatus = AdmissionApplicationStatus.SUBMITTED,
  ): ApplicationsRepository {
    return {
      findApplicationById: jest.fn().mockResolvedValue({
        id: 'application-1',
        schoolId: 'school-1',
        organizationId: 'org-1',
        leadId: null,
        studentName: 'Layla Hassan',
        requestedAcademicYearId: null,
        requestedGradeId: null,
        source: 'REFERRAL',
        status,
        submittedAt: new Date('2026-04-21T08:00:00.000Z'),
        createdAt: new Date('2026-04-20T08:00:00.000Z'),
        updatedAt: new Date('2026-04-20T08:00:00.000Z'),
        deletedAt: null,
      }),
    } as unknown as ApplicationsRepository;
  }

  function createAdmissionDecisionsRepository(params?: {
    existingDecision?: AdmissionDecisionStoreItem | null;
    totalPlacementTests?: number;
    completedPlacementTests?: number;
    totalInterviews?: number;
    completedInterviews?: number;
  }): AdmissionDecisionsRepository {
    const existingDecision = params?.existingDecision ?? null;

    return {
      findAdmissionDecisionByApplicationId: jest
        .fn()
        .mockResolvedValue(existingDecision),
      countPlacementTestsForApplication: jest
        .fn()
        .mockImplementation(
          async ({
            status,
          }: {
            status?: 'COMPLETED';
          }) =>
            status === 'COMPLETED'
              ? (params?.completedPlacementTests ?? 0)
              : (params?.totalPlacementTests ?? 0),
        ),
      countInterviewsForApplication: jest
        .fn()
        .mockImplementation(
          async ({
            status,
          }: {
            status?: 'COMPLETED';
          }) =>
            status === 'COMPLETED'
              ? (params?.completedInterviews ?? 0)
              : (params?.totalInterviews ?? 0),
        ),
      createDecisionAndUpdateApplicationStatus: jest.fn().mockImplementation(
        async ({
          applicationId,
          decision,
          reason,
          decidedByUserId,
          decidedAt,
          schoolId,
          applicationStatus,
        }) =>
          ({
            id: 'decision-1',
            schoolId,
            applicationId,
            decision,
            reason,
            decidedByUserId,
            decidedAt,
            createdAt: decidedAt,
            updatedAt: decidedAt,
            application: {
              id: applicationId,
              studentName: 'Layla Hassan',
              status: applicationStatus,
            },
            decidedByUser: {
              id: decidedByUserId,
              firstName: 'Salma',
              lastName: 'Omar',
              email: 'salma.omar@example.com',
            },
          }) satisfies AdmissionDecisionStoreItem,
      ),
    } as unknown as AdmissionDecisionsRepository;
  }

  function createWorkflowPolicyResolver(
    policy?: Partial<AdmissionWorkflowPolicySettings>,
  ): ResolveAdmissionWorkflowPolicyService {
    return {
      resolveForCurrentSchool: jest.fn().mockResolvedValue({
        id: null,
        ...DEFAULT_ADMISSION_WORKFLOW_POLICY,
        ...policy,
        source: 'default',
        updatedAt: null,
      }),
    } as unknown as ResolveAdmissionWorkflowPolicyService;
  }

  async function buildApplicationForValidation(
    status: AdmissionApplicationStatus = AdmissionApplicationStatus.SUBMITTED,
  ) {
    const application = await createApplicationsRepository(
      status,
    ).findApplicationById('application-1');
    if (!application) {
      throw new Error('Expected test application');
    }

    return application;
  }

  async function expectDecisionValidationAllowed(params: {
    decision?: AdmissionDecisionType;
    applicationStatus?: AdmissionApplicationStatus;
    policy?: Partial<AdmissionWorkflowPolicySettings>;
    totalPlacementTests?: number;
    completedPlacementTests?: number;
    totalInterviews?: number;
    completedInterviews?: number;
  }): Promise<void> {
    const admissionDecisionsRepository = createAdmissionDecisionsRepository({
      totalPlacementTests: params.totalPlacementTests,
      completedPlacementTests: params.completedPlacementTests,
      totalInterviews: params.totalInterviews,
      completedInterviews: params.completedInterviews,
    });
    const validator = new DecisionWorkflowValidator(
      admissionDecisionsRepository,
      createWorkflowPolicyResolver(params.policy),
    );
    const application = await buildApplicationForValidation(
      params.applicationStatus,
    );

    await expect(
      withScope(() =>
        validator.ensureDecisionCanBeCreated(
          application,
          params.decision ?? AdmissionDecisionType.ACCEPT,
        ),
      ),
    ).resolves.toBeUndefined();
  }

  async function expectDecisionValidationBlocked(params: {
    decision?: AdmissionDecisionType;
    applicationStatus?: AdmissionApplicationStatus;
    policy?: Partial<AdmissionWorkflowPolicySettings>;
    totalPlacementTests?: number;
    completedPlacementTests?: number;
    totalInterviews?: number;
    completedInterviews?: number;
  }): Promise<void> {
    const admissionDecisionsRepository = createAdmissionDecisionsRepository({
      totalPlacementTests: params.totalPlacementTests,
      completedPlacementTests: params.completedPlacementTests,
      totalInterviews: params.totalInterviews,
      completedInterviews: params.completedInterviews,
    });
    const validator = new DecisionWorkflowValidator(
      admissionDecisionsRepository,
      createWorkflowPolicyResolver(params.policy),
    );
    const application = await buildApplicationForValidation(
      params.applicationStatus,
    );

    await expect(
      withScope(() =>
        validator.ensureDecisionCanBeCreated(
          application,
          params.decision ?? AdmissionDecisionType.ACCEPT,
        ),
      ),
    ).rejects.toBeInstanceOf(DecisionRequiresAllStepsException);
  }

  it('creates an admission decision successfully and writes an audit record', async () => {
    const applicationsRepository = createApplicationsRepository();
    const admissionDecisionsRepository = createAdmissionDecisionsRepository({
      totalPlacementTests: 1,
      completedPlacementTests: 1,
      totalInterviews: 1,
      completedInterviews: 1,
    });
    const validator = new DecisionWorkflowValidator(
      admissionDecisionsRepository,
      createWorkflowPolicyResolver(),
    );
    const createAuditLog = jest.fn().mockResolvedValue(undefined);
    const authRepository = {
      createAuditLog,
    } as unknown as AuthRepository;
    const useCase = new CreateAdmissionDecisionUseCase(
      applicationsRepository,
      admissionDecisionsRepository,
      validator,
      authRepository,
    );

    const result = await withScope(() =>
      useCase.execute({
        applicationId: 'application-1',
        decision: 'accept',
        reason: 'Passed all checks',
      }),
    );

    expect(result.id).toBe('decision-1');
    expect(result.applicationStatus).toBe('accepted');
    expect(result.decision).toBe('accept');
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        schoolId: 'school-1',
        module: 'admissions',
        action: 'admissions.application.decision',
        resourceType: 'admission_decision',
        resourceId: 'decision-1',
        outcome: AuditOutcome.SUCCESS,
      }),
    );
  });

  it('rejects duplicate admission decisions for the same application', async () => {
    const applicationsRepository = createApplicationsRepository();
    const admissionDecisionsRepository = createAdmissionDecisionsRepository({
      existingDecision: {
        id: 'decision-existing',
        schoolId: 'school-1',
        applicationId: 'application-1',
        decision: AdmissionDecisionType.ACCEPT,
        reason: 'Existing decision',
        decidedByUserId: 'user-2',
        decidedAt: new Date('2026-04-22T09:00:00.000Z'),
        createdAt: new Date('2026-04-22T09:00:00.000Z'),
        updatedAt: new Date('2026-04-22T09:00:00.000Z'),
        application: {
          id: 'application-1',
          studentName: 'Layla Hassan',
          status: AdmissionApplicationStatus.ACCEPTED,
        },
        decidedByUser: {
          id: 'user-2',
          firstName: 'Salma',
          lastName: 'Omar',
          email: 'salma.omar@example.com',
        },
      },
      totalPlacementTests: 1,
      completedPlacementTests: 1,
      totalInterviews: 1,
      completedInterviews: 1,
    });
    const validator = new DecisionWorkflowValidator(
      admissionDecisionsRepository,
      createWorkflowPolicyResolver(),
    );
    const authRepository = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;
    const useCase = new CreateAdmissionDecisionUseCase(
      applicationsRepository,
      admissionDecisionsRepository,
      validator,
      authRepository,
    );

    await expect(
      withScope(() =>
        useCase.execute({
          applicationId: 'application-1',
          decision: 'reject',
        }),
      ),
    ).rejects.toBeInstanceOf(ApplicationAlreadyDecidedException);
  });

  it('rejects decisions when the workflow prerequisites are not satisfied', async () => {
    const applicationsRepository = createApplicationsRepository(
      AdmissionApplicationStatus.SUBMITTED,
    );
    const admissionDecisionsRepository = createAdmissionDecisionsRepository({
      totalPlacementTests: 1,
      completedPlacementTests: 0,
      totalInterviews: 1,
      completedInterviews: 1,
    });
    const validator = new DecisionWorkflowValidator(
      admissionDecisionsRepository,
      createWorkflowPolicyResolver(),
    );
    const authRepository = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;
    const useCase = new CreateAdmissionDecisionUseCase(
      applicationsRepository,
      admissionDecisionsRepository,
      validator,
      authRepository,
    );

    await expect(
      withScope(() =>
        useCase.execute({
          applicationId: 'application-1',
          decision: 'waitlist',
        }),
      ),
    ).rejects.toBeInstanceOf(DecisionRequiresAllStepsException);
  });

  it('preserves default strict policy for missing and completed workflow steps', async () => {
    await expectDecisionValidationBlocked({
      totalPlacementTests: 0,
      completedPlacementTests: 0,
      totalInterviews: 0,
      completedInterviews: 0,
    });

    await expectDecisionValidationAllowed({
      totalPlacementTests: 1,
      completedPlacementTests: 1,
      totalInterviews: 1,
      completedInterviews: 1,
    });
  });

  it('allows interview-only decisions when placement tests are optional', async () => {
    await expectDecisionValidationAllowed({
      policy: { requiresPlacementTest: false },
      totalPlacementTests: 0,
      completedPlacementTests: 0,
      totalInterviews: 1,
      completedInterviews: 1,
    });
  });

  it('allows test-only decisions when interviews are optional', async () => {
    await expectDecisionValidationAllowed({
      policy: { requiresInterview: false },
      totalPlacementTests: 1,
      completedPlacementTests: 1,
      totalInterviews: 0,
      completedInterviews: 0,
    });
  });

  it('allows direct acceptance only when both steps are optional and policy permits it', async () => {
    await expectDecisionValidationAllowed({
      policy: {
        requiresPlacementTest: false,
        requiresInterview: false,
        allowDirectAcceptance: true,
      },
      decision: AdmissionDecisionType.ACCEPT,
      totalPlacementTests: 0,
      completedPlacementTests: 0,
      totalInterviews: 0,
      completedInterviews: 0,
    });

    await expectDecisionValidationBlocked({
      policy: {
        requiresPlacementTest: false,
        requiresInterview: false,
        allowDirectAcceptance: false,
      },
      decision: AdmissionDecisionType.ACCEPT,
      totalPlacementTests: 0,
      completedPlacementTests: 0,
      totalInterviews: 0,
      completedInterviews: 0,
    });
  });

  it('does not let optional incomplete steps block otherwise satisfied workflow decisions', async () => {
    await expectDecisionValidationAllowed({
      policy: { requiresPlacementTest: false },
      totalPlacementTests: 1,
      completedPlacementTests: 0,
      totalInterviews: 1,
      completedInterviews: 1,
    });

    await expectDecisionValidationAllowed({
      policy: { requiresInterview: false },
      totalPlacementTests: 1,
      completedPlacementTests: 1,
      totalInterviews: 1,
      completedInterviews: 0,
    });
  });

  it('keeps invalid application statuses blocked even when workflow steps are optional', async () => {
    await expectDecisionValidationBlocked({
      applicationStatus: AdmissionApplicationStatus.DOCUMENTS_PENDING,
      policy: {
        requiresPlacementTest: false,
        requiresInterview: false,
        allowDirectAcceptance: true,
      },
    });
    await expectDecisionValidationBlocked({
      applicationStatus: AdmissionApplicationStatus.ACCEPTED,
      policy: {
        requiresPlacementTest: false,
        requiresInterview: false,
        allowDirectAcceptance: true,
      },
    });
    await expectDecisionValidationBlocked({
      applicationStatus: AdmissionApplicationStatus.WAITLISTED,
      policy: {
        requiresPlacementTest: false,
        requiresInterview: false,
        allowDirectAcceptance: true,
      },
    });
    await expectDecisionValidationBlocked({
      applicationStatus: AdmissionApplicationStatus.REJECTED,
      policy: {
        requiresPlacementTest: false,
        requiresInterview: false,
        allowDirectAcceptance: true,
      },
    });
  });

  it('presents admission decisions with the bounded API shape', () => {
    const result = presentAdmissionDecision({
      id: 'decision-1',
      schoolId: 'school-1',
      applicationId: 'application-1',
      decision: AdmissionDecisionType.WAITLIST,
      reason: 'Need one more review',
      decidedByUserId: 'user-1',
      decidedAt: new Date('2026-04-22T09:30:00.000Z'),
      createdAt: new Date('2026-04-22T09:30:00.000Z'),
      updatedAt: new Date('2026-04-22T09:30:00.000Z'),
      application: {
        id: 'application-1',
        studentName: 'Layla Hassan',
        status: AdmissionApplicationStatus.WAITLISTED,
      },
      decidedByUser: {
        id: 'user-1',
        firstName: 'Salma',
        lastName: 'Omar',
        email: 'salma.omar@example.com',
      },
    } as AdmissionDecisionStoreItem);

    expect(result).toEqual({
      id: 'decision-1',
      applicationId: 'application-1',
      studentName: 'Layla Hassan',
      decision: 'waitlist',
      reason: 'Need one more review',
      decidedByUserId: 'user-1',
      decidedByName: 'Salma Omar',
      decidedAt: '2026-04-22T09:30:00.000Z',
      applicationStatus: 'waitlisted',
      createdAt: '2026-04-22T09:30:00.000Z',
      updatedAt: '2026-04-22T09:30:00.000Z',
    });
  });
});
