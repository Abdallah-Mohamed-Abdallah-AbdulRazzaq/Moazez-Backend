import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AdmissionApplicationSource,
  AdmissionApplicationStatus,
  AdmissionDecisionType,
  AdmissionDocumentStatus,
  FileVisibility,
  InterviewStatus,
  MembershipStatus,
  OrganizationStatus,
  PlacementTestStatus,
  PrismaClient,
  SchoolStatus,
  StudentStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'AdmDashboardState123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type ApplicationResponse = {
  id: string;
  status: string;
  documentsSummary: {
    pendingReviewCount: number;
    reviewableCount: number;
    missingCount: number;
    needsReplacementCount: number;
    hasPendingReview: boolean;
    hasReviewableDocuments: boolean;
    hasMissingDocuments: boolean;
  };
  dashboardState: {
    canProceedToDecision: boolean;
    canRegister: boolean;
    registrationState: string;
    decisionState: {
      canCreateDecision: boolean;
      canAccept: boolean;
      canWaitlist: boolean;
      canReject: boolean;
      reason: string;
    };
    workflowReadiness: {
      policy: {
        requiresPlacementTest: boolean;
        requiresInterview: boolean;
        allowDirectAcceptance: boolean;
        source: 'default' | 'school_override';
      };
      placementTests: {
        required: boolean;
        total: number;
        completed: number;
        satisfied: boolean;
      };
      interviews: {
        required: boolean;
        total: number;
        completed: number;
        satisfied: boolean;
      };
    };
    documentSignals: {
      hasPendingReview: boolean;
      hasReviewableDocuments: boolean;
      hasMissingDocuments: boolean;
      pendingReviewCount: number;
      reviewableCount: number;
      missingCount: number;
      needsReplacementCount: number;
    };
    blockers: Array<{ code: string; message: string }>;
  };
};

jest.setTimeout(90000);

describe('Admissions dashboard state (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  const suffix = randomUUID().split('-')[0];
  const marker = `adm-dashboard-state-${suffix}`;

  let organizationId = '';
  let schoolAId = '';
  let schoolBId = '';
  let schoolAManageToken = '';
  let schoolBManageToken = '';

  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdMembershipIds: string[] = [];
  const createdApplicationIds: string[] = [];
  const createdDecisionIds: string[] = [];
  const createdPlacementTestIds: string[] = [];
  const createdInterviewIds: string[] = [];
  const createdFileIds: string[] = [];
  const createdDocumentIds: string[] = [];
  const createdStudentIds: string[] = [];

  const applicationIds: Record<
    | 'strictMissing'
    | 'strictReady'
    | 'alreadyDecided'
    | 'invalidStatus'
    | 'onlyInterview'
    | 'onlyPlacement'
    | 'direct'
    | 'acceptedReady'
    | 'acceptedWaitlist'
    | 'registered'
    | 'documentSignals'
    | 'tenantB',
    string
  > = {
    strictMissing: '',
    strictReady: '',
    alreadyDecided: '',
    invalidStatus: '',
    onlyInterview: '',
    onlyPlacement: '',
    direct: '',
    acceptedReady: '',
    acceptedWaitlist: '',
    registered: '',
    documentSignals: '',
    tenantB: '',
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org`,
        name: `ADM Dashboard State ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationId = organization.id;
    createdOrganizationIds.push(organizationId);

    const [schoolA, schoolB] = await Promise.all([
      prisma.school.create({
        data: {
          organizationId,
          slug: `${marker}-school-a`,
          name: `${marker} School A`,
          status: SchoolStatus.ACTIVE,
        },
        select: { id: true },
      }),
      prisma.school.create({
        data: {
          organizationId,
          slug: `${marker}-school-b`,
          name: `${marker} School B`,
          status: SchoolStatus.ACTIVE,
        },
        select: { id: true },
      }),
    ]);
    schoolAId = schoolA.id;
    schoolBId = schoolB.id;
    createdSchoolIds.push(schoolAId, schoolBId);

    const [schoolARoleId, schoolBRoleId] = await Promise.all([
      createRoleWithPermissions({
        schoolId: schoolAId,
        label: 'school-a-manage',
        permissionCodes: [
          'admissions.applications.view',
          'admissions.applications.manage',
        ],
      }),
      createRoleWithPermissions({
        schoolId: schoolBId,
        label: 'school-b-manage',
        permissionCodes: [
          'admissions.applications.view',
          'admissions.applications.manage',
        ],
      }),
    ]);
    await createSchoolUser({
      label: 'school-a-manage',
      schoolId: schoolAId,
      roleId: schoolARoleId,
    });
    await createSchoolUser({
      label: 'school-b-manage',
      schoolId: schoolBId,
      roleId: schoolBRoleId,
    });

    applicationIds.strictMissing = await createApplication({
      schoolId: schoolAId,
      status: AdmissionApplicationStatus.SUBMITTED,
      studentName: 'Strict Missing',
    });
    applicationIds.strictReady = await createApplication({
      schoolId: schoolAId,
      status: AdmissionApplicationStatus.SUBMITTED,
      studentName: 'Strict Ready',
    });
    applicationIds.alreadyDecided = await createApplication({
      schoolId: schoolAId,
      status: AdmissionApplicationStatus.SUBMITTED,
      studentName: 'Already Decided',
    });
    applicationIds.invalidStatus = await createApplication({
      schoolId: schoolAId,
      status: AdmissionApplicationStatus.DOCUMENTS_PENDING,
      studentName: 'Invalid Status',
    });
    applicationIds.onlyInterview = await createApplication({
      schoolId: schoolAId,
      status: AdmissionApplicationStatus.SUBMITTED,
      studentName: 'Only Interview',
    });
    applicationIds.onlyPlacement = await createApplication({
      schoolId: schoolAId,
      status: AdmissionApplicationStatus.SUBMITTED,
      studentName: 'Only Placement',
    });
    applicationIds.direct = await createApplication({
      schoolId: schoolAId,
      status: AdmissionApplicationStatus.SUBMITTED,
      studentName: 'Direct Decision',
    });
    applicationIds.acceptedReady = await createApplication({
      schoolId: schoolAId,
      status: AdmissionApplicationStatus.ACCEPTED,
      studentName: 'Accepted Ready',
    });
    applicationIds.acceptedWaitlist = await createApplication({
      schoolId: schoolAId,
      status: AdmissionApplicationStatus.ACCEPTED,
      studentName: 'Accepted Waitlist Decision',
    });
    applicationIds.registered = await createApplication({
      schoolId: schoolAId,
      status: AdmissionApplicationStatus.ACCEPTED,
      studentName: 'Registered',
    });
    applicationIds.documentSignals = await createApplication({
      schoolId: schoolAId,
      status: AdmissionApplicationStatus.SUBMITTED,
      studentName: 'Document Signals',
    });
    applicationIds.tenantB = await createApplication({
      schoolId: schoolBId,
      status: AdmissionApplicationStatus.SUBMITTED,
      studentName: 'Tenant B',
    });

    await Promise.all([
      createCompletedWorkflow(applicationIds.strictReady, schoolAId),
      createCompletedWorkflow(applicationIds.alreadyDecided, schoolAId),
      createCompletedWorkflow(applicationIds.invalidStatus, schoolAId),
      createInterview(applicationIds.onlyInterview, schoolAId, InterviewStatus.COMPLETED),
      createPlacementTest(
        applicationIds.onlyPlacement,
        schoolAId,
        PlacementTestStatus.COMPLETED,
      ),
      createCompletedWorkflow(applicationIds.acceptedReady, schoolAId),
      createCompletedWorkflow(applicationIds.acceptedWaitlist, schoolAId),
      createCompletedWorkflow(applicationIds.tenantB, schoolBId),
    ]);

    await Promise.all([
      createDecision({
        applicationId: applicationIds.alreadyDecided,
        schoolId: schoolAId,
        decision: AdmissionDecisionType.WAITLIST,
      }),
      createDecision({
        applicationId: applicationIds.acceptedReady,
        schoolId: schoolAId,
        decision: AdmissionDecisionType.ACCEPT,
      }),
      createDecision({
        applicationId: applicationIds.acceptedWaitlist,
        schoolId: schoolAId,
        decision: AdmissionDecisionType.WAITLIST,
      }),
      createDecision({
        applicationId: applicationIds.registered,
        schoolId: schoolAId,
        decision: AdmissionDecisionType.ACCEPT,
      }),
    ]);

    await createStudentForApplication(applicationIds.registered, schoolAId);
    await createApplicationDocument({
      applicationId: applicationIds.documentSignals,
      schoolId: schoolAId,
      status: AdmissionDocumentStatus.MISSING,
      documentType: 'document_signal_missing',
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.init();

    schoolAManageToken = await login(`${marker}-school-a-manage@example.test`);
    schoolBManageToken = await login(`${marker}-school-b-manage@example.test`);
  });

  afterAll(async () => {
    try {
      await cleanupData();
      if (app) await app.close();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('includes dashboardState in application list and detail under default strict policy', async () => {
    const list = await listApplications(schoolAManageToken);
    const listItem = list.find(
      (application) => application.id === applicationIds.strictMissing,
    );
    expect(listItem?.dashboardState).toEqual(
      expect.objectContaining({
        canProceedToDecision: false,
        canRegister: false,
        registrationState: 'not_accepted',
        decisionState: expect.objectContaining({
          canCreateDecision: false,
          canAccept: false,
          canWaitlist: false,
          canReject: false,
          reason: 'workflow_policy_not_satisfied',
        }),
      }),
    );

    const detail = await getApplication(
      schoolAManageToken,
      applicationIds.strictMissing,
    );
    expect(detail.dashboardState.workflowReadiness).toEqual({
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
    expectNoDashboardLeaks(detail.dashboardState);
  });

  it('marks completed required workflow as ready for SUBMITTED applications', async () => {
    const detail = await getApplication(
      schoolAManageToken,
      applicationIds.strictReady,
    );

    expect(detail.dashboardState.canProceedToDecision).toBe(true);
    expect(detail.dashboardState.decisionState).toEqual({
      canCreateDecision: true,
      canAccept: true,
      canWaitlist: true,
      canReject: true,
      reason: 'ready',
    });
    expect(detail.dashboardState.workflowReadiness.placementTests).toEqual({
      required: true,
      total: 1,
      completed: 1,
      satisfied: true,
    });
    expect(detail.dashboardState.workflowReadiness.interviews).toEqual({
      required: true,
      total: 1,
      completed: 1,
      satisfied: true,
    });
  });

  it('returns already_decided and application_status_not_decidable reasons', async () => {
    const alreadyDecided = await getApplication(
      schoolAManageToken,
      applicationIds.alreadyDecided,
    );
    const invalidStatus = await getApplication(
      schoolAManageToken,
      applicationIds.invalidStatus,
    );

    expect(alreadyDecided.dashboardState.canProceedToDecision).toBe(false);
    expect(alreadyDecided.dashboardState.decisionState.reason).toBe(
      'already_decided',
    );
    expect(alreadyDecided.dashboardState.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'already_decided' }),
      ]),
    );

    expect(invalidStatus.dashboardState.canProceedToDecision).toBe(false);
    expect(invalidStatus.dashboardState.decisionState.reason).toBe(
      'application_status_not_decidable',
    );
  });

  it('reflects optional workflow policies and direct acceptance rules', async () => {
    await patchPolicy(schoolAManageToken, {
      requiresPlacementTest: false,
      requiresInterview: true,
      allowDirectAcceptance: false,
    });
    const placementOptional = await getApplication(
      schoolAManageToken,
      applicationIds.onlyInterview,
    );
    expect(placementOptional.dashboardState.canProceedToDecision).toBe(true);
    expect(
      placementOptional.dashboardState.workflowReadiness.policy.source,
    ).toBe('school_override');

    await patchPolicy(schoolAManageToken, {
      requiresPlacementTest: true,
      requiresInterview: false,
      allowDirectAcceptance: false,
    });
    const interviewOptional = await getApplication(
      schoolAManageToken,
      applicationIds.onlyPlacement,
    );
    expect(interviewOptional.dashboardState.canProceedToDecision).toBe(true);

    await patchPolicy(schoolAManageToken, {
      requiresPlacementTest: false,
      requiresInterview: false,
      allowDirectAcceptance: true,
    });
    const directAllowed = await getApplication(
      schoolAManageToken,
      applicationIds.direct,
    );
    expect(directAllowed.dashboardState.decisionState).toEqual({
      canCreateDecision: true,
      canAccept: true,
      canWaitlist: true,
      canReject: true,
      reason: 'ready',
    });

    await patchPolicy(schoolAManageToken, {
      requiresPlacementTest: false,
      requiresInterview: false,
      allowDirectAcceptance: false,
    });
    const directBlocked = await getApplication(
      schoolAManageToken,
      applicationIds.direct,
    );
    expect(directBlocked.dashboardState.decisionState).toEqual({
      canCreateDecision: true,
      canAccept: false,
      canWaitlist: true,
      canReject: true,
      reason: 'direct_acceptance_not_allowed',
    });
  });

  it('returns deterministic registration states and canRegister readiness', async () => {
    await patchPolicy(schoolAManageToken, {
      requiresPlacementTest: true,
      requiresInterview: true,
      allowDirectAcceptance: false,
    });

    const [notAccepted, acceptedReady, acceptedWaitlist, registered] =
      await Promise.all([
        getApplication(schoolAManageToken, applicationIds.strictReady),
        getApplication(schoolAManageToken, applicationIds.acceptedReady),
        getApplication(schoolAManageToken, applicationIds.acceptedWaitlist),
        getApplication(schoolAManageToken, applicationIds.registered),
      ]);

    expect(notAccepted.dashboardState.registrationState).toBe('not_accepted');
    expect(notAccepted.dashboardState.canRegister).toBe(false);

    expect(acceptedReady.dashboardState.registrationState).toBe(
      'ready_to_register',
    );
    expect(acceptedReady.dashboardState.canRegister).toBe(true);

    expect(acceptedWaitlist.dashboardState.registrationState).toBe(
      'decision_not_accept',
    );
    expect(acceptedWaitlist.dashboardState.canRegister).toBe(false);

    expect(registered.dashboardState.registrationState).toBe('registered');
    expect(registered.dashboardState.canRegister).toBe(false);
    expect(registered.dashboardState.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'already_registered' }),
      ]),
    );
  });

  it('mirrors documentSignals from documentsSummary and avoids internal leaks', async () => {
    const detail = await getApplication(
      schoolAManageToken,
      applicationIds.documentSignals,
    );

    expect(detail.dashboardState.documentSignals).toEqual({
      hasPendingReview: detail.documentsSummary.hasPendingReview,
      hasReviewableDocuments: detail.documentsSummary.hasReviewableDocuments,
      hasMissingDocuments: detail.documentsSummary.hasMissingDocuments,
      pendingReviewCount: detail.documentsSummary.pendingReviewCount,
      reviewableCount: detail.documentsSummary.reviewableCount,
      missingCount: detail.documentsSummary.missingCount,
      needsReplacementCount: detail.documentsSummary.needsReplacementCount,
    });
    expect(detail.dashboardState.documentSignals.hasMissingDocuments).toBe(true);
    expectNoDashboardLeaks(detail.dashboardState);
  });

  it('keeps school policy and dashboard state scoped per school', async () => {
    await patchPolicy(schoolAManageToken, {
      requiresPlacementTest: false,
      requiresInterview: false,
      allowDirectAcceptance: true,
    });

    const schoolA = await getApplication(
      schoolAManageToken,
      applicationIds.direct,
    );
    const schoolB = await getApplication(
      schoolBManageToken,
      applicationIds.tenantB,
    );

    expect(schoolA.dashboardState.workflowReadiness.policy).toEqual({
      requiresPlacementTest: false,
      requiresInterview: false,
      allowDirectAcceptance: true,
      source: 'school_override',
    });
    expect(schoolB.dashboardState.workflowReadiness.policy).toEqual({
      requiresPlacementTest: true,
      requiresInterview: true,
      allowDirectAcceptance: false,
      source: 'default',
    });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/applications/${applicationIds.tenantB}`)
      .set('Authorization', bearer(schoolAManageToken))
      .expect(404);
  });

  async function listApplications(
    accessToken: string,
  ): Promise<ApplicationResponse[]> {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/applications`)
      .set('Authorization', bearer(accessToken))
      .expect(200);

    for (const application of response.body as ApplicationResponse[]) {
      expect(application.dashboardState).toEqual(
        expect.objectContaining({
          canProceedToDecision: expect.any(Boolean),
          canRegister: expect.any(Boolean),
          registrationState: expect.any(String),
          decisionState: expect.any(Object),
          workflowReadiness: expect.any(Object),
          documentSignals: expect.any(Object),
          blockers: expect.any(Array),
        }),
      );
    }

    return response.body;
  }

  async function getApplication(
    accessToken: string,
    applicationId: string,
  ): Promise<ApplicationResponse> {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/applications/${applicationId}`)
      .set('Authorization', bearer(accessToken))
      .expect(200);

    expect(response.body.dashboardState).toEqual(
      expect.objectContaining({
        canProceedToDecision: expect.any(Boolean),
        canRegister: expect.any(Boolean),
        registrationState: expect.any(String),
        decisionState: expect.objectContaining({
          canCreateDecision: expect.any(Boolean),
          canAccept: expect.any(Boolean),
          canWaitlist: expect.any(Boolean),
          canReject: expect.any(Boolean),
          reason: expect.any(String),
        }),
        workflowReadiness: expect.any(Object),
        documentSignals: expect.any(Object),
        blockers: expect.any(Array),
      }),
    );

    return response.body;
  }

  async function patchPolicy(
    accessToken: string,
    body: {
      requiresPlacementTest: boolean;
      requiresInterview: boolean;
      allowDirectAcceptance: boolean;
    },
  ): Promise<void> {
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/admissions/workflow-policy`)
      .set('Authorization', bearer(accessToken))
      .send(body)
      .expect(200);
  }

  function expectNoDashboardLeaks(dashboardState: unknown): void {
    const serialized = JSON.stringify(dashboardState);

    for (const forbidden of [
      'applicationId',
      'decisionId',
      'policyId',
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'actorId',
      'userId',
      'applicantUserId',
      'studentId',
      'guardianId',
      'registrationId',
      'placementTestId',
      'interviewId',
      'documentId',
      'fileId',
      'bucket',
      'objectKey',
      'provider',
      'signedUrl',
      'passwordHash',
      'deletedAt',
      'createdAt',
      'updatedAt',
      'SUBMITTED',
      'ACCEPTED',
      'COMPLETED',
      'WAITLIST',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }

  async function createRoleWithPermissions(input: {
    schoolId: string;
    label: string;
    permissionCodes: string[];
  }): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId: input.schoolId,
        key: `${marker}-${input.label}`,
        name: `${marker} ${input.label}`,
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);

    for (const permissionCode of input.permissionCodes) {
      const permission = await prisma.permission.findUnique({
        where: { code: permissionCode },
        select: { id: true },
      });
      if (!permission) {
        throw new Error(
          `Missing ${permissionCode} permission - run \`npm run seed\` first.`,
        );
      }

      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      });
    }

    return role.id;
  }

  async function createSchoolUser(input: {
    label: string;
    schoolId: string;
    roleId: string;
  }): Promise<void> {
    const user = await prisma.user.create({
      data: {
        email: `${marker}-${input.label}@example.test`,
        firstName: 'ADM',
        lastName: input.label,
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
        passwordChangedAt: new Date(),
        credentialVersion: 1,
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    const membership = await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId,
        schoolId: input.schoolId,
        roleId: input.roleId,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdMembershipIds.push(membership.id);
  }

  async function createApplication(input: {
    schoolId: string;
    status: AdmissionApplicationStatus;
    studentName: string;
  }): Promise<string> {
    const application = await prisma.application.create({
      data: {
        schoolId: input.schoolId,
        organizationId,
        studentName: `${marker} ${input.studentName}`,
        source: AdmissionApplicationSource.IN_APP,
        status: input.status,
        submittedAt: new Date('2026-07-04T08:00:00.000Z'),
      },
      select: { id: true },
    });
    createdApplicationIds.push(application.id);

    return application.id;
  }

  async function createCompletedWorkflow(
    applicationId: string,
    schoolId: string,
  ): Promise<void> {
    await Promise.all([
      createPlacementTest(applicationId, schoolId, PlacementTestStatus.COMPLETED),
      createInterview(applicationId, schoolId, InterviewStatus.COMPLETED),
    ]);
  }

  async function createPlacementTest(
    applicationId: string,
    schoolId: string,
    status: PlacementTestStatus,
  ): Promise<void> {
    const test = await prisma.placementTest.create({
      data: {
        schoolId,
        applicationId,
        type: 'Placement',
        scheduledAt: new Date('2026-07-05T10:00:00.000Z'),
        score: status === PlacementTestStatus.COMPLETED ? 87 : null,
        result: status === PlacementTestStatus.COMPLETED ? 'Passed' : null,
        status,
      },
      select: { id: true },
    });
    createdPlacementTestIds.push(test.id);
  }

  async function createInterview(
    applicationId: string,
    schoolId: string,
    status: InterviewStatus,
  ): Promise<void> {
    const interview = await prisma.interview.create({
      data: {
        schoolId,
        applicationId,
        scheduledAt: new Date('2026-07-05T11:00:00.000Z'),
        status,
        notes: status === InterviewStatus.COMPLETED ? 'Completed' : null,
      },
      select: { id: true },
    });
    createdInterviewIds.push(interview.id);
  }

  async function createDecision(input: {
    applicationId: string;
    schoolId: string;
    decision: AdmissionDecisionType;
  }): Promise<void> {
    const decision = await prisma.admissionDecision.create({
      data: {
        schoolId: input.schoolId,
        applicationId: input.applicationId,
        decision: input.decision,
        reason: 'Dashboard state fixture',
        decidedByUserId: createdUserIds[0],
        decidedAt: new Date('2026-07-06T09:00:00.000Z'),
      },
      select: { id: true },
    });
    createdDecisionIds.push(decision.id);
  }

  async function createStudentForApplication(
    applicationId: string,
    schoolId: string,
  ): Promise<void> {
    const student = await prisma.student.create({
      data: {
        schoolId,
        organizationId,
        applicationId,
        firstName: 'Registered',
        lastName: 'Student',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdStudentIds.push(student.id);
  }

  async function createApplicationDocument(input: {
    applicationId: string;
    schoolId: string;
    status: AdmissionDocumentStatus;
    documentType: string;
  }): Promise<void> {
    const file = await prisma.file.create({
      data: {
        organizationId,
        schoolId: input.schoolId,
        uploaderId: null,
        bucket: 'dashboard-state-fixtures',
        objectKey: `${marker}/${input.documentType}.pdf`,
        originalName: `${input.documentType}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: BigInt(512),
        checksumSha256: `${marker}-${input.documentType}`,
        visibility: FileVisibility.PRIVATE,
      },
      select: { id: true },
    });
    createdFileIds.push(file.id);

    const document = await prisma.applicationDocument.create({
      data: {
        schoolId: input.schoolId,
        applicationId: input.applicationId,
        fileId: file.id,
        documentType: input.documentType,
        status: input.status,
        notes: null,
      },
      select: { id: true },
    });
    createdDocumentIds.push(document.id);
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return response.body.accessToken;
  }

  function bearer(accessToken: string): string {
    return `Bearer ${accessToken}`;
  }

  async function cleanupData(): Promise<void> {
    if (!prisma) return;

    await prisma.admissionDecision.deleteMany({
      where: { id: { in: createdDecisionIds } },
    });
    await prisma.interview.deleteMany({
      where: { id: { in: createdInterviewIds } },
    });
    await prisma.placementTest.deleteMany({
      where: { id: { in: createdPlacementTestIds } },
    });
    await prisma.applicationDocument.deleteMany({
      where: { id: { in: createdDocumentIds } },
    });
    await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    await prisma.admissionWorkflowPolicy.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.file.deleteMany({ where: { id: { in: createdFileIds } } });
    await prisma.application.deleteMany({
      where: { id: { in: createdApplicationIds } },
    });
    await prisma.session.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.membership.deleteMany({
      where: { id: { in: createdMembershipIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: createdRoleIds } },
    });
    await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
    await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrganizationIds } },
    });
  }
});
