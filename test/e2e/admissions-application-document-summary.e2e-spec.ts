import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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
const PASSWORD = 'AdmDocSummary123!';
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

jest.setTimeout(90000);

describe('Admissions application document summaries (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let schoolAId = '';
  let schoolBId = '';
  let viewRoleAId = '';
  let viewRoleBId = '';
  let noPermissionRoleId = '';
  let applicantUserId = '';
  let applicantProfileId = '';

  let schoolAAccessToken = '';
  let schoolBAccessToken = '';
  let noPermissionAccessToken = '';
  let applicantAccessToken = '';

  const suffix = randomUUID().split('-')[0];
  const marker = `adm-doc-summary-${suffix}`;
  const createdApplicationIds: string[] = [];
  const createdApplicationDocumentIds: string[] = [];
  const createdApplicantDocumentIds: string[] = [];
  const createdRequestIds: string[] = [];
  const createdFileIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdProfileIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  const applicationIds: Record<
    | 'noDocuments'
    | 'staffComplete'
    | 'pendingReviewable'
    | 'accepted'
    | 'replacement'
    | 'nonReviewable'
    | 'tenantB',
    string
  > = {
    noDocuments: '',
    staffComplete: '',
    pendingReviewable: '',
    accepted: '',
    replacement: '',
    nonReviewable: '',
    tenantB: '',
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org`,
        name: `ADM Document Summary ${suffix}`,
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

    viewRoleAId = await createRoleWithPermissions({
      schoolId: schoolAId,
      label: 'school-a-view',
      permissionCodes: ['admissions.applications.view'],
    });
    viewRoleBId = await createRoleWithPermissions({
      schoolId: schoolBId,
      label: 'school-b-view',
      permissionCodes: ['admissions.applications.view'],
    });
    noPermissionRoleId = await createRoleWithPermissions({
      schoolId: schoolAId,
      label: 'school-a-no-permission',
      permissionCodes: [],
    });

    await createSchoolUser('school-a-view', schoolAId, viewRoleAId);
    await createSchoolUser('school-b-view', schoolBId, viewRoleBId);
    await createSchoolUser('school-a-none', schoolAId, noPermissionRoleId);

    const applicant = await createApplicantUser();
    applicantUserId = applicant.userId;
    applicantProfileId = applicant.profileId;

    applicationIds.noDocuments = await createApplication({
      schoolId: schoolAId,
      status: AdmissionApplicationStatus.SUBMITTED,
      studentName: 'No Documents',
    });
    applicationIds.staffComplete = await createApplication({
      schoolId: schoolAId,
      status: AdmissionApplicationStatus.SUBMITTED,
      studentName: 'Staff Complete',
    });
    applicationIds.pendingReviewable = await createApplication({
      schoolId: schoolAId,
      status: AdmissionApplicationStatus.SUBMITTED,
      studentName: 'Pending Reviewable',
    });
    applicationIds.accepted = await createApplication({
      schoolId: schoolAId,
      status: AdmissionApplicationStatus.SUBMITTED,
      studentName: 'Applicant Accepted',
    });
    applicationIds.replacement = await createApplication({
      schoolId: schoolAId,
      status: AdmissionApplicationStatus.DOCUMENTS_PENDING,
      studentName: 'Replacement Requested',
    });
    applicationIds.nonReviewable = await createApplication({
      schoolId: schoolAId,
      status: AdmissionApplicationStatus.ACCEPTED,
      studentName: 'Non Reviewable',
    });
    applicationIds.tenantB = await createApplication({
      schoolId: schoolBId,
      status: AdmissionApplicationStatus.SUBMITTED,
      studentName: 'Tenant B Hidden',
    });

    await createApplicationDocument({
      applicationId: applicationIds.staffComplete,
      schoolId: schoolAId,
      status: AdmissionDocumentStatus.COMPLETE,
      documentType: 'Staff complete',
    });
    await createBridgedApplicationDocument({
      applicationId: applicationIds.pendingReviewable,
      schoolId: schoolAId,
      documentStatus: AdmissionDocumentStatus.PENDING_REVIEW,
      applicantDocumentStatus: ApplicantAdmissionRequestDocumentStatus.UPLOADED,
      documentType: 'Applicant uploaded',
    });
    await createBridgedApplicationDocument({
      applicationId: applicationIds.accepted,
      schoolId: schoolAId,
      documentStatus: AdmissionDocumentStatus.COMPLETE,
      applicantDocumentStatus: ApplicantAdmissionRequestDocumentStatus.ACCEPTED,
      documentType: 'Applicant accepted',
    });
    await createBridgedApplicationDocument({
      applicationId: applicationIds.replacement,
      schoolId: schoolAId,
      documentStatus: AdmissionDocumentStatus.MISSING,
      applicantDocumentStatus:
        ApplicantAdmissionRequestDocumentStatus.NEEDS_REPLACEMENT,
      documentType: 'Applicant replacement requested',
    });
    await createBridgedApplicationDocument({
      applicationId: applicationIds.nonReviewable,
      schoolId: schoolAId,
      documentStatus: AdmissionDocumentStatus.PENDING_REVIEW,
      applicantDocumentStatus: ApplicantAdmissionRequestDocumentStatus.UPLOADED,
      documentType: 'Applicant pending accepted application',
    });
    await createBridgedApplicationDocument({
      applicationId: applicationIds.tenantB,
      schoolId: schoolBId,
      documentStatus: AdmissionDocumentStatus.PENDING_REVIEW,
      applicantDocumentStatus: ApplicantAdmissionRequestDocumentStatus.UPLOADED,
      documentType: 'Tenant B applicant uploaded',
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

    schoolAAccessToken = await login(`${marker}-school-a-view@example.test`);
    schoolBAccessToken = await login(`${marker}-school-b-view@example.test`);
    noPermissionAccessToken = await login(
      `${marker}-school-a-none@example.test`,
    );
    applicantAccessToken = await login(`${marker}-applicant@example.test`);
  });

  afterAll(async () => {
    try {
      await cleanupData();
      if (app) await app.close();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('includes zero documentsSummary in list and detail for applications without documents', async () => {
    const list = await listApplications(schoolAAccessToken);
    const listItem = list.find(
      (application) => application.id === applicationIds.noDocuments,
    );

    expect(listItem?.documentsSummary).toEqual(emptySummary());
    expectNoSummaryLeaks(listItem?.documentsSummary);

    const detail = await getApplication(
      schoolAAccessToken,
      applicationIds.noDocuments,
    );

    expect(detail.documentsSummary).toEqual(emptySummary());
    expectNoSummaryLeaks(detail.documentsSummary);
  });

  it('counts staff-uploaded complete documents', async () => {
    const detail = await getApplication(
      schoolAAccessToken,
      applicationIds.staffComplete,
    );

    expect(detail.documentsSummary).toEqual({
      totalCount: 1,
      completeCount: 1,
      missingCount: 0,
      pendingReviewCount: 0,
      reviewableCount: 0,
      applicantPortalCount: 0,
      staffUploadCount: 1,
      needsReplacementCount: 0,
      hasPendingReview: false,
      hasReviewableDocuments: false,
      hasMissingDocuments: false,
    });
    expectNoSummaryLeaks(detail.documentsSummary);
  });

  it('counts applicant-bridged uploaded pending_review documents as reviewable for reviewable applications', async () => {
    const detail = await getApplication(
      schoolAAccessToken,
      applicationIds.pendingReviewable,
    );

    expect(detail.documentsSummary).toEqual({
      totalCount: 1,
      completeCount: 0,
      missingCount: 0,
      pendingReviewCount: 1,
      reviewableCount: 1,
      applicantPortalCount: 1,
      staffUploadCount: 0,
      needsReplacementCount: 0,
      hasPendingReview: true,
      hasReviewableDocuments: true,
      hasMissingDocuments: false,
    });
    expectNoSummaryLeaks(detail.documentsSummary);
  });

  it('counts accepted and replacement-requested applicant documents without marking them reviewable', async () => {
    const accepted = await getApplication(
      schoolAAccessToken,
      applicationIds.accepted,
    );
    const replacement = await getApplication(
      schoolAAccessToken,
      applicationIds.replacement,
    );

    expect(accepted.documentsSummary).toEqual({
      totalCount: 1,
      completeCount: 1,
      missingCount: 0,
      pendingReviewCount: 0,
      reviewableCount: 0,
      applicantPortalCount: 1,
      staffUploadCount: 0,
      needsReplacementCount: 0,
      hasPendingReview: false,
      hasReviewableDocuments: false,
      hasMissingDocuments: false,
    });
    expect(replacement.documentsSummary).toEqual({
      totalCount: 1,
      completeCount: 0,
      missingCount: 1,
      pendingReviewCount: 0,
      reviewableCount: 0,
      applicantPortalCount: 1,
      staffUploadCount: 0,
      needsReplacementCount: 1,
      hasPendingReview: false,
      hasReviewableDocuments: false,
      hasMissingDocuments: true,
    });
    expectNoSummaryLeaks(accepted.documentsSummary);
    expectNoSummaryLeaks(replacement.documentsSummary);
  });

  it('keeps pendingReviewCount but clears reviewableCount when application status is not reviewable', async () => {
    const detail = await getApplication(
      schoolAAccessToken,
      applicationIds.nonReviewable,
    );

    expect(detail.status).toBe('accepted');
    expect(detail.documentsSummary).toEqual({
      totalCount: 1,
      completeCount: 0,
      missingCount: 0,
      pendingReviewCount: 1,
      reviewableCount: 0,
      applicantPortalCount: 1,
      staffUploadCount: 0,
      needsReplacementCount: 0,
      hasPendingReview: true,
      hasReviewableDocuments: false,
      hasMissingDocuments: false,
    });
    expectNoSummaryLeaks(detail.documentsSummary);
  });

  it('keeps document summaries scoped and still requires admissions application view permission', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/applications`)
      .set('Authorization', bearer(noPermissionAccessToken))
      .expect(403);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/applications/${applicationIds.noDocuments}`)
      .set('Authorization', bearer(noPermissionAccessToken))
      .expect(403);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/applications`)
      .set('Authorization', bearer(applicantAccessToken))
      .expect(403);

    const schoolAList = await listApplications(schoolAAccessToken);
    expect(
      schoolAList.some((application) => application.id === applicationIds.tenantB),
    ).toBe(false);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/applications/${applicationIds.tenantB}`)
      .set('Authorization', bearer(schoolAAccessToken))
      .expect(404);

    const schoolBDetail = await getApplication(
      schoolBAccessToken,
      applicationIds.tenantB,
    );
    expect(schoolBDetail.documentsSummary).toEqual({
      totalCount: 1,
      completeCount: 0,
      missingCount: 0,
      pendingReviewCount: 1,
      reviewableCount: 1,
      applicantPortalCount: 1,
      staffUploadCount: 0,
      needsReplacementCount: 0,
      hasPendingReview: true,
      hasReviewableDocuments: true,
      hasMissingDocuments: false,
    });
    expectNoSummaryLeaks(schoolBDetail.documentsSummary);
  });

  async function listApplications(
    accessToken: string,
  ): Promise<Array<{ id: string; documentsSummary: DocumentsSummary }>> {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/applications`)
      .set('Authorization', bearer(accessToken))
      .expect(200);

    for (const application of response.body) {
      expect(application.documentsSummary).toEqual(
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
      expect(application).not.toHaveProperty('documents');
    }

    return response.body;
  }

  async function getApplication(
    accessToken: string,
    applicationId: string,
  ): Promise<{
    id: string;
    status: string;
    documentsSummary: DocumentsSummary;
  }> {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/applications/${applicationId}`)
      .set('Authorization', bearer(accessToken))
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
    expect(response.body).not.toHaveProperty('documents');

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

  function expectNoSummaryLeaks(summary: unknown): void {
    const serialized = JSON.stringify(summary);

    for (const forbidden of [
      'id',
      'documentId',
      'applicationDocumentId',
      'applicantDocumentId',
      'applicantUserId',
      'requestId',
      'requiredDocumentId',
      'schoolId',
      'organizationId',
      'deletedAt',
      'fileId',
      'bucket',
      'objectKey',
      'provider',
      'signedUrl',
      'downloadUrl',
      'actorId',
      'membershipId',
      'roleId',
      'passwordHash',
      'PENDING_REVIEW',
      'COMPLETE',
      'MISSING',
      'UPLOADED',
      'ACCEPTED',
      'NEEDS_REPLACEMENT',
      'SUPERSEDED',
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

  async function createSchoolUser(
    label: string,
    schoolId: string,
    roleId: string,
  ): Promise<void> {
    const user = await prisma.user.create({
      data: {
        email: `${marker}-${label}@example.test`,
        firstName: 'ADM',
        lastName: label,
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
        passwordChangedAt: new Date(),
        credentialVersion: 1,
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId,
        schoolId,
        roleId,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
      },
    });
  }

  async function createApplicantUser(): Promise<{
    userId: string;
    profileId: string;
  }> {
    const user = await prisma.user.create({
      data: {
        email: `${marker}-applicant@example.test`,
        firstName: 'Applicant',
        lastName: 'Summary',
        userType: UserType.APPLICANT,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
        passwordChangedAt: new Date(),
        credentialVersion: 1,
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    const profile = await prisma.applicantProfile.create({
      data: {
        userId: user.id,
        fullName: 'Applicant Summary',
        phoneNumber: '+20 100 000 0000',
        city: 'Cairo',
        relationship: 'guardian',
      },
      select: { id: true },
    });
    createdProfileIds.push(profile.id);

    return { userId: user.id, profileId: profile.id };
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
        submittedAt: new Date('2026-07-01T08:00:00.000Z'),
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
    const file = await createFile(input.schoolId, input.documentType);
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
    createdApplicationDocumentIds.push(document.id);

    return { id: document.id, fileId: file.id };
  }

  async function createBridgedApplicationDocument(input: {
    applicationId: string;
    schoolId: string;
    documentStatus: AdmissionDocumentStatus;
    applicantDocumentStatus: ApplicantAdmissionRequestDocumentStatus;
    documentType: string;
  }): Promise<void> {
    const document = await createApplicationDocument({
      applicationId: input.applicationId,
      schoolId: input.schoolId,
      status: input.documentStatus,
      documentType: input.documentType,
    });
    const request = await prisma.applicantAdmissionRequest.create({
      data: {
        applicantUserId,
        applicantProfileId,
        schoolId: input.schoolId,
        organizationId,
        childFirstName: 'Summary',
        childFullName: `${marker} Summary Child`,
        status: ApplicantAdmissionRequestStatus.SUBMITTED,
        submittedAt: new Date('2026-07-01T08:00:00.000Z'),
        applicationId: input.applicationId,
      },
      select: { id: true },
    });
    createdRequestIds.push(request.id);

    const applicantDocument =
      await prisma.applicantAdmissionRequestDocument.create({
        data: {
          requestId: request.id,
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
  }

  async function createFile(
    schoolId: string,
    label: string,
  ): Promise<{ id: string }> {
    const file = await prisma.file.create({
      data: {
        organizationId,
        schoolId,
        uploaderId: null,
        bucket: 'admissions-summary-fixtures',
        objectKey: `${marker}/${label.replace(/\s+/g, '-').toLowerCase()}.pdf`,
        originalName: `${label}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: BigInt(256),
        checksumSha256: `${marker}-${label}`,
        visibility: FileVisibility.PRIVATE,
      },
      select: { id: true },
    });
    createdFileIds.push(file.id);

    return file;
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

    await prisma.applicantAdmissionRequestDocument.deleteMany({
      where: { id: { in: createdApplicantDocumentIds } },
    });
    await prisma.applicationDocument.deleteMany({
      where: { id: { in: createdApplicationDocumentIds } },
    });
    await prisma.applicantAdmissionRequest.deleteMany({
      where: { id: { in: createdRequestIds } },
    });
    await prisma.application.deleteMany({
      where: { id: { in: createdApplicationIds } },
    });
    await prisma.file.deleteMany({ where: { id: { in: createdFileIds } } });
    await prisma.session.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.membership.deleteMany({
      where: { userId: { in: createdUserIds } },
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
