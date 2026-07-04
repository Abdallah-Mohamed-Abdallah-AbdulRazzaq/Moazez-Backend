import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  AdmissionApplicationSource,
  AdmissionApplicationStatus,
  AdmissionDocumentStatus,
  ApplicantAdmissionRequestDocumentStatus,
  ApplicantAdmissionRequestStatus,
  FileVisibility,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'AdmFeContract123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type DocumentsSummary = {
  totalCount: number;
  completeCount: number;
  missingCount: number;
  pendingReviewCount: number;
  reviewableCount: number;
  applicantPortalCount: number;
  staffUploadCount: number;
  needsReplacementCount: number;
  hasPendingReview: boolean;
  hasReviewableDocuments: boolean;
  hasMissingDocuments: boolean;
};

type DashboardState = {
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

type ApplicationResponse = {
  id: string;
  status: string;
  documentsSummary: DocumentsSummary;
  dashboardState: DashboardState;
};

type ApplicationDocumentResponse = {
  id: string;
  status: string;
  source: string;
  canReview: boolean;
  reviewEligibility: {
    canAccept: boolean;
    canReject: boolean;
    canRequestReplacement: boolean;
    reason: string;
  };
  linkedApplicantDocument: { id: string; status: string } | null;
};

jest.setTimeout(90000);

describe('Admissions frontend contract (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  const suffix = randomUUID().split('-')[0];
  const marker = `adm-fe-contract-${suffix}`;

  let organizationId = '';
  let schoolAId = '';
  let schoolBId = '';
  let schoolAToken = '';
  let applicantToken = '';
  let applicantUserId = '';
  let applicantProfileId = '';
  let noDocumentsApplicationId = '';
  let documentsApplicationId = '';
  let tenantBApplicationId = '';
  let staffDocumentId = '';
  let applicantDocumentId = '';
  let linkedApplicantDocumentId = '';
  let guardianId = '';

  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdProfileIds: string[] = [];
  const createdMembershipIds: string[] = [];
  const createdApplicationIds: string[] = [];
  const createdApplicationDocumentIds: string[] = [];
  const createdApplicantRequestIds: string[] = [];
  const createdApplicantDocumentIds: string[] = [];
  const createdFileIds: string[] = [];
  const createdGuardianIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org`,
        name: `ADM FE Contract ${suffix}`,
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

    const schoolARoleId = await createRoleWithPermissions({
      schoolId: schoolAId,
      label: 'school-a-contract',
      permissionCodes: [
        'admissions.applications.view',
        'admissions.applications.manage',
        'admissions.documents.view',
        'admissions.documents.manage',
        'students.guardians.view',
      ],
    });

    await createSchoolUser({
      label: 'school-a-contract',
      schoolId: schoolAId,
      roleId: schoolARoleId,
    });
    await createApplicantUser();

    noDocumentsApplicationId = await createApplication({
      schoolId: schoolAId,
      status: AdmissionApplicationStatus.SUBMITTED,
      studentName: 'No Documents',
    });
    documentsApplicationId = await createApplication({
      schoolId: schoolAId,
      status: AdmissionApplicationStatus.SUBMITTED,
      studentName: 'Document Contract',
    });
    tenantBApplicationId = await createApplication({
      schoolId: schoolBId,
      status: AdmissionApplicationStatus.SUBMITTED,
      studentName: 'Tenant B Hidden',
    });

    const staffDocument = await createApplicationDocument({
      applicationId: documentsApplicationId,
      schoolId: schoolAId,
      status: AdmissionDocumentStatus.COMPLETE,
      documentType: 'staff_complete',
    });
    staffDocumentId = staffDocument.id;

    const bridgedDocument = await createBridgedApplicationDocument({
      applicationId: documentsApplicationId,
      schoolId: schoolAId,
      documentStatus: AdmissionDocumentStatus.PENDING_REVIEW,
      applicantDocumentStatus: ApplicantAdmissionRequestDocumentStatus.UPLOADED,
      documentType: 'applicant_uploaded',
    });
    applicantDocumentId = bridgedDocument.applicationDocumentId;
    linkedApplicantDocumentId = bridgedDocument.applicantDocumentId;

    await createBridgedApplicationDocument({
      applicationId: tenantBApplicationId,
      schoolId: schoolBId,
      documentStatus: AdmissionDocumentStatus.PENDING_REVIEW,
      applicantDocumentStatus: ApplicantAdmissionRequestDocumentStatus.UPLOADED,
      documentType: 'tenant_b_uploaded',
    });

    const guardian = await prisma.guardian.create({
      data: {
        schoolId: schoolAId,
        organizationId,
        firstName: 'Fda',
        lastName: `Contract ${suffix}`,
        phone: '+201011990003',
        email: `${marker}-guardian@example.test`,
        relation: 'father',
        isPrimary: true,
      },
      select: { id: true },
    });
    guardianId = guardian.id;
    createdGuardianIds.push(guardianId);

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

    schoolAToken = await login(`${marker}-school-a-contract@example.test`);
    applicantToken = await login(`${marker}-applicant@example.test`);
  });

  afterAll(async () => {
    try {
      await cleanupData();
      if (app) await app.close();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('returns documentsSummary and dashboardState on application list and detail', async () => {
    const listResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/applications`)
      .set('Authorization', bearer(schoolAToken))
      .expect(200);

    const noDocumentsListItem = (
      listResponse.body as ApplicationResponse[]
    ).find((application) => application.id === noDocumentsApplicationId);
    const documentsListItem = (listResponse.body as ApplicationResponse[]).find(
      (application) => application.id === documentsApplicationId,
    );

    expect(noDocumentsListItem?.documentsSummary).toEqual(emptySummary());
    expect(noDocumentsListItem?.dashboardState).toEqual(
      expect.objectContaining({
        canProceedToDecision: false,
        canRegister: false,
        registrationState: 'not_accepted',
      }),
    );

    expect(documentsListItem?.documentsSummary).toEqual(
      documentContractSummary(),
    );
    expect(documentsListItem?.dashboardState.documentSignals).toEqual({
      hasPendingReview: true,
      hasReviewableDocuments: true,
      hasMissingDocuments: false,
      pendingReviewCount: 1,
      reviewableCount: 1,
      missingCount: 0,
      needsReplacementCount: 0,
    });

    const detail = await getApplication(documentsApplicationId);
    expect(detail.documentsSummary).toEqual(documentContractSummary());
    expect(detail.dashboardState.documentSignals).toEqual({
      hasPendingReview: detail.documentsSummary.hasPendingReview,
      hasReviewableDocuments: detail.documentsSummary.hasReviewableDocuments,
      hasMissingDocuments: detail.documentsSummary.hasMissingDocuments,
      pendingReviewCount: detail.documentsSummary.pendingReviewCount,
      reviewableCount: detail.documentsSummary.reviewableCount,
      missingCount: detail.documentsSummary.missingCount,
      needsReplacementCount: detail.documentsSummary.needsReplacementCount,
    });

    expectNoApplicationContractLeaks(listResponse.body);
    expectNoApplicationContractLeaks(detail);
  });

  it('returns workflow policy contract and dashboardState reacts after policy PATCH', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/workflow-policy`)
      .set('Authorization', bearer(schoolAToken))
      .expect(200)
      .expect(({ body }) => {
        expect(Object.keys(body).sort()).toEqual(
          [
            'allowDirectAcceptance',
            'requiresInterview',
            'requiresPlacementTest',
            'source',
            'updatedAt',
          ].sort(),
        );
        expect(body).toEqual({
          requiresPlacementTest: true,
          requiresInterview: true,
          allowDirectAcceptance: false,
          source: 'default',
          updatedAt: null,
        });
        expectNoPolicyLeaks(body);
      });

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/admissions/workflow-policy`)
      .set('Authorization', bearer(schoolAToken))
      .send({
        requiresPlacementTest: false,
        requiresInterview: false,
        allowDirectAcceptance: true,
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          requiresPlacementTest: false,
          requiresInterview: false,
          allowDirectAcceptance: true,
          source: 'school_override',
          updatedAt: expect.any(String),
        });
        expectNoPolicyLeaks(body);
      });

    const detail = await getApplication(noDocumentsApplicationId);
    expect(detail.dashboardState.workflowReadiness.policy).toEqual({
      requiresPlacementTest: false,
      requiresInterview: false,
      allowDirectAcceptance: true,
      source: 'school_override',
    });
    expect(detail.dashboardState.canProceedToDecision).toBe(true);
    expect(detail.dashboardState.decisionState.reason).toBe('ready');
  });

  it('returns document review fields and proves pending_review alone is not enough', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/admissions/applications/${documentsApplicationId}/documents`,
      )
      .set('Authorization', bearer(schoolAToken))
      .expect(200);

    const documents = response.body as ApplicationDocumentResponse[];
    const staffDocument = documents.find(
      (document) => document.id === staffDocumentId,
    );
    const applicantDocument = documents.find(
      (document) => document.id === applicantDocumentId,
    );

    expect(staffDocument).toEqual(
      expect.objectContaining({
        status: 'complete',
        source: 'staff_upload',
        canReview: false,
        reviewEligibility: {
          canAccept: false,
          canReject: false,
          canRequestReplacement: false,
          reason: 'document_not_pending_review',
        },
        linkedApplicantDocument: null,
      }),
    );

    expect(applicantDocument).toEqual(
      expect.objectContaining({
        status: 'pending_review',
        source: 'applicant_portal',
        canReview: true,
        reviewEligibility: {
          canAccept: true,
          canReject: true,
          canRequestReplacement: true,
          reason: 'reviewable',
        },
        linkedApplicantDocument: {
          id: linkedApplicantDocumentId,
          status: 'uploaded',
        },
      }),
    );

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/admissions/applications/${documentsApplicationId}/documents`,
      )
      .set('Authorization', bearer(schoolAToken))
      .send({
        fileId: await createLooseFile(schoolAId, 'rejected_pending_review'),
        documentType: 'rejected_pending_review',
        status: 'pending_review',
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body.error?.code).toBe('validation.failed');
        expect(body.error?.details).toEqual({
          field: 'status',
          reason: 'pending_review_reserved_for_applicant_portal',
        });
      });

    expectNoSchoolDocumentLeaks(response.body);
  });

  it('keeps canonical guardians search available and legacy route out of student uuid validation', async () => {
    const canonicalResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/guardians?search=fda`)
      .set('Authorization', bearer(schoolAToken))
      .expect(200);

    const legacyResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/students-guardians/students/guardians?search=fda`)
      .set('Authorization', bearer(schoolAToken))
      .expect(200);

    expect(legacyResponse.body?.error?.code).not.toBe('validation.failed');
    expect(canonicalResponse.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ guardianId })]),
    );
    expect(legacyResponse.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ guardianId })]),
    );
    expect(Object.keys(legacyResponse.body[0]).sort()).toEqual(
      Object.keys(canonicalResponse.body[0]).sort(),
    );
    expectNoGuardianLeaks(canonicalResponse.body);
    expectNoGuardianLeaks(legacyResponse.body);
  });

  it('keeps school-side contracts scoped and blocks applicant access', async () => {
    const listResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/applications`)
      .set('Authorization', bearer(schoolAToken))
      .expect(200);

    expect(
      (listResponse.body as ApplicationResponse[]).some(
        (application) => application.id === tenantBApplicationId,
      ),
    ).toBe(false);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/applications/${tenantBApplicationId}`)
      .set('Authorization', bearer(schoolAToken))
      .expect(404);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/applications`)
      .set('Authorization', bearer(applicantToken))
      .expect(403);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/admissions/applications/${documentsApplicationId}/documents`,
      )
      .set('Authorization', bearer(applicantToken))
      .expect(403);
  });

  it('documents the new response fields in generated Swagger schemas', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Contract Audit')
        .setVersion('contract-audit')
        .addBearerAuth()
        .build(),
    );
    const schemas = document.components?.schemas ?? {};

    expect(schemas.ApplicationResponseDto?.properties).toEqual(
      expect.objectContaining({
        documentsSummary: expect.any(Object),
        dashboardState: expect.any(Object),
      }),
    );
    expect(schemas.ApplicationDocumentsSummaryDto?.properties).toEqual(
      expect.objectContaining({
        totalCount: expect.any(Object),
        reviewableCount: expect.any(Object),
        hasReviewableDocuments: expect.any(Object),
      }),
    );
    expect(schemas.ApplicationDashboardStateDto?.properties).toEqual(
      expect.objectContaining({
        canProceedToDecision: expect.any(Object),
        canRegister: expect.any(Object),
        decisionState: expect.any(Object),
        workflowReadiness: expect.any(Object),
        documentSignals: expect.any(Object),
        blockers: expect.any(Object),
      }),
    );
    expect(schemas.ApplicationDocumentResponseDto?.properties).toEqual(
      expect.objectContaining({
        source: expect.any(Object),
        canReview: expect.any(Object),
        reviewEligibility: expect.any(Object),
        linkedApplicantDocument: expect.any(Object),
      }),
    );
    expect(schemas.AdmissionWorkflowPolicyResponseDto?.properties).toEqual(
      expect.objectContaining({
        requiresPlacementTest: expect.any(Object),
        requiresInterview: expect.any(Object),
        allowDirectAcceptance: expect.any(Object),
        source: expect.any(Object),
        updatedAt: expect.any(Object),
      }),
    );
  });

  async function getApplication(
    applicationId: string,
  ): Promise<ApplicationResponse> {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/applications/${applicationId}`)
      .set('Authorization', bearer(schoolAToken))
      .expect(200);

    expect(response.body.documentsSummary).toEqual(
      expect.objectContaining({
        totalCount: expect.any(Number),
        completeCount: expect.any(Number),
        missingCount: expect.any(Number),
        pendingReviewCount: expect.any(Number),
        reviewableCount: expect.any(Number),
        applicantPortalCount: expect.any(Number),
        staffUploadCount: expect.any(Number),
        needsReplacementCount: expect.any(Number),
        hasPendingReview: expect.any(Boolean),
        hasReviewableDocuments: expect.any(Boolean),
        hasMissingDocuments: expect.any(Boolean),
      }),
    );
    expect(response.body.dashboardState).toEqual(
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

    return response.body;
  }

  function emptySummary(): DocumentsSummary {
    return {
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
  }

  function documentContractSummary(): DocumentsSummary {
    return {
      totalCount: 2,
      completeCount: 1,
      missingCount: 0,
      pendingReviewCount: 1,
      reviewableCount: 1,
      applicantPortalCount: 1,
      staffUploadCount: 1,
      needsReplacementCount: 0,
      hasPendingReview: true,
      hasReviewableDocuments: true,
      hasMissingDocuments: false,
    };
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

  async function createApplicantUser(): Promise<void> {
    const user = await prisma.user.create({
      data: {
        email: `${marker}-applicant@example.test`,
        firstName: 'Applicant',
        lastName: 'Contract',
        userType: UserType.APPLICANT,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
        passwordChangedAt: new Date(),
        credentialVersion: 1,
      },
      select: { id: true },
    });
    applicantUserId = user.id;
    createdUserIds.push(user.id);

    const profile = await prisma.applicantProfile.create({
      data: {
        userId: user.id,
        fullName: 'Applicant Contract',
        phoneNumber: '+20 100 000 0000',
        city: 'Cairo',
        relationship: 'guardian',
      },
      select: { id: true },
    });
    applicantProfileId = profile.id;
    createdProfileIds.push(profile.id);
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

  async function createApplicationDocument(input: {
    applicationId: string;
    schoolId: string;
    status: AdmissionDocumentStatus;
    documentType: string;
  }): Promise<{ id: string; fileId: string }> {
    const fileId = await createLooseFile(input.schoolId, input.documentType);
    const document = await prisma.applicationDocument.create({
      data: {
        schoolId: input.schoolId,
        applicationId: input.applicationId,
        fileId,
        documentType: input.documentType,
        status: input.status,
        notes: null,
      },
      select: { id: true },
    });
    createdApplicationDocumentIds.push(document.id);

    return { id: document.id, fileId };
  }

  async function createBridgedApplicationDocument(input: {
    applicationId: string;
    schoolId: string;
    documentStatus: AdmissionDocumentStatus;
    applicantDocumentStatus: ApplicantAdmissionRequestDocumentStatus;
    documentType: string;
  }): Promise<{
    applicationDocumentId: string;
    applicantDocumentId: string;
  }> {
    const document = await createApplicationDocument({
      applicationId: input.applicationId,
      schoolId: input.schoolId,
      status: input.documentStatus,
      documentType: input.documentType,
    });
    const applicantRequest = await prisma.applicantAdmissionRequest.create({
      data: {
        applicantUserId,
        applicantProfileId,
        schoolId: input.schoolId,
        organizationId,
        childFirstName: 'Contract',
        childFullName: `${marker} Contract Child`,
        status: ApplicantAdmissionRequestStatus.SUBMITTED,
        submittedAt: new Date('2026-07-04T08:00:00.000Z'),
        applicationId: input.applicationId,
      },
      select: { id: true },
    });
    createdApplicantRequestIds.push(applicantRequest.id);

    const applicantDocument =
      await prisma.applicantAdmissionRequestDocument.create({
        data: {
          requestId: applicantRequest.id,
          applicantUserId,
          schoolId: input.schoolId,
          organizationId,
          requiredDocumentId: null,
          applicationDocumentId: document.id,
          fileId: document.fileId,
          title: input.documentType,
          documentType: input.documentType,
          status: input.applicantDocumentStatus,
          notes: null,
        },
        select: { id: true },
      });
    createdApplicantDocumentIds.push(applicantDocument.id);

    return {
      applicationDocumentId: document.id,
      applicantDocumentId: applicantDocument.id,
    };
  }

  async function createLooseFile(
    schoolId: string,
    label: string,
  ): Promise<string> {
    const file = await prisma.file.create({
      data: {
        organizationId,
        schoolId,
        uploaderId: null,
        bucket: 'admissions-fe-contract-fixtures',
        objectKey: `${marker}/${label}.pdf`,
        originalName: `${label}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: BigInt(512),
        checksumSha256: `${marker}-${label}-${createdFileIds.length}`,
        visibility: FileVisibility.PRIVATE,
      },
      select: { id: true },
    });
    createdFileIds.push(file.id);

    return file.id;
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

  function expectNoApplicationContractLeaks(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'applicantUserId',
      'requestId',
      'requiredDocumentId',
      'deletedAt',
      'bucket',
      'objectKey',
      'provider',
      'signedUrl',
      'downloadUrl',
      'passwordHash',
      'membershipId',
      'roleId',
      'SUBMITTED',
      'PENDING_REVIEW',
      'UPLOADED',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }

  function expectNoSchoolDocumentLeaks(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'applicantUserId',
      'applicantProfileId',
      'requestId',
      'requiredDocumentId',
      'schoolId',
      'organizationId',
      'bucket',
      'objectKey',
      'provider',
      'signedUrl',
      'downloadUrl',
      'PENDING_REVIEW',
      'UPLOADED',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }

  function expectNoPolicyLeaks(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'policyId',
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'actorId',
      'audit',
      'deletedAt',
      'passwordHash',
      'userId',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }

  function expectNoGuardianLeaks(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'deletedAt',
      'passwordHash',
      'userId',
      'applicationId',
      'bucket',
      'objectKey',
      'provider',
      'signedUrl',
      'actorId',
      'auditLog',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }

  async function cleanupData(): Promise<void> {
    if (!prisma) return;

    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: createdUserIds } },
          { schoolId: { in: createdSchoolIds } },
          { organizationId: { in: createdOrganizationIds } },
        ],
      },
    });
    await prisma.applicantAdmissionRequestDocument.deleteMany({
      where: { id: { in: createdApplicantDocumentIds } },
    });
    await prisma.applicationDocument.deleteMany({
      where: { id: { in: createdApplicationDocumentIds } },
    });
    await prisma.applicantAdmissionRequest.deleteMany({
      where: { id: { in: createdApplicantRequestIds } },
    });
    await prisma.application.deleteMany({
      where: { id: { in: createdApplicationIds } },
    });
    await prisma.file.deleteMany({ where: { id: { in: createdFileIds } } });
    await prisma.guardian.deleteMany({
      where: { id: { in: createdGuardianIds } },
    });
    await prisma.admissionWorkflowPolicy.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.session.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.membership.deleteMany({
      where: { id: { in: createdMembershipIds } },
    });
    await prisma.applicantProfile.deleteMany({
      where: { id: { in: createdProfileIds } },
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
