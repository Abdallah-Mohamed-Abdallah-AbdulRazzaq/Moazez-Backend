import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AdmissionApplicationStatus,
  AdmissionDocumentStatus,
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
import { StorageService } from '../../src/infrastructure/storage/storage.service';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'Applicant18MBridge!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(90000);

type AuthTokens = {
  accessToken: string;
};

describe('Applicant Portal document bridge (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageService: StorageService;

  let organizationId = '';
  let activeSchoolId = '';
  let otherSchoolId = '';
  let requiredDocumentId = '';
  let secondRequiredDocumentId = '';
  let activeRoleId = '';
  let otherRoleId = '';
  let applicantUserId = '';

  let applicantAuth: AuthTokens;
  let schoolUserAuth: AuthTokens;
  let otherSchoolUserAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s18m-bridge-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdSchoolProfileIds: string[] = [];
  const createdDocumentIds: string[] = [];
  const createdRequestIds: string[] = [];
  const createdApplicationIds: string[] = [];
  const createdApplicantDocumentIds: string[] = [];
  const createdFileIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdProfileIds: string[] = [];
  const createdRoleIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await createOrganization({
      slug: `${marker}-org`,
      name: `Sprint 18M Bridge Org ${suffix}`,
    });
    organizationId = organization.id;

    activeSchoolId = await createSchoolWithProfile({
      organizationId,
      slug: `${marker}-school-a`,
      name: `${marker} School A`,
      schoolName: `${marker} School A Public`,
    });
    otherSchoolId = await createSchoolWithProfile({
      organizationId,
      slug: `${marker}-school-b`,
      name: `${marker} School B`,
      schoolName: `${marker} School B Public`,
    });

    requiredDocumentId = await createRequiredDocument({
      schoolId: activeSchoolId,
      organizationId,
      title: 'Birth certificate',
      sortOrder: 10,
    });
    secondRequiredDocumentId = await createRequiredDocument({
      schoolId: activeSchoolId,
      organizationId,
      title: 'Parent ID',
      sortOrder: 20,
    });

    activeRoleId = await createAdmissionsViewerRole(activeSchoolId, 'a');
    otherRoleId = await createAdmissionsViewerRole(otherSchoolId, 'b');
    await createUserWithMembership(UserType.SCHOOL_USER, 'school-user', {
      schoolId: activeSchoolId,
      roleId: activeRoleId,
    });
    await createUserWithMembership(UserType.SCHOOL_USER, 'other-school-user', {
      schoolId: otherSchoolId,
      roleId: otherRoleId,
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
    storageService = moduleRef.get(StorageService);

    applicantUserId = await createApplicantAccount('primary');
    applicantAuth = await login(`${marker}-primary@example.test`);
    schoolUserAuth = await login(`${marker}-school-user@example.test`);
    otherSchoolUserAuth = await login(
      `${marker}-other-school-user@example.test`,
    );
  });

  afterAll(async () => {
    try {
      await cleanupData();
      if (app) await app.close();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('keeps draft applicant documents invisible to school Admissions', async () => {
    const requestId = (await createDraftRequest('Draft Only')).id;
    const upload = await uploadDocument(requestId, {
      requiredDocumentId,
      filename: 'draft-birth.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('draft-birth'),
    }).expect(201);
    rememberDocumentAndFile(upload.body);
    expectNoApplicantInternalFields(upload.body);

    await expect(
      prisma.applicationDocument.count({
        where: {
          applicantAdmissionRequestDocuments: {
            some: { requestId },
          },
        },
      }),
    ).resolves.toBe(0);
  });

  it('bridges submitted draft uploads once and exposes them through school Admissions documents', async () => {
    const requestId = (await createDraftRequest('Bridge Submit')).id;
    const upload = await uploadDocument(requestId, {
      requiredDocumentId,
      filename: 'birth-submit.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('birth-submit'),
    }).expect(201);
    rememberDocumentAndFile(upload.body);

    const submitResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/submit`)
      .set('Authorization', bearer(applicantAuth))
      .expect(200);
    expectNoApplicantInternalFields(submitResponse.body);

    const applicationId = await getApplicationIdForRequest(requestId);
    createdApplicationIds.push(applicationId);
    await expect(
      prisma.application.findUnique({
        where: { id: applicationId },
        select: { status: true },
      }),
    ).resolves.toEqual({
      status: AdmissionApplicationStatus.DOCUMENTS_PENDING,
    });

    const bridgedDocuments = await prisma.applicationDocument.findMany({
      where: { applicationId },
      select: {
        id: true,
        schoolId: true,
        fileId: true,
        documentType: true,
        status: true,
        applicantAdmissionRequestDocuments: {
          select: { id: true },
        },
      },
    });
    expect(bridgedDocuments).toHaveLength(1);
    expect(bridgedDocuments[0]).toMatchObject({
      schoolId: activeSchoolId,
      fileId: upload.body.file.id,
      documentType: 'Birth certificate',
      status: AdmissionDocumentStatus.PENDING_REVIEW,
      applicantAdmissionRequestDocuments: [{ id: upload.body.id }],
    });

    await expect(
      prisma.applicantAdmissionRequestDocument.findUnique({
        where: { id: upload.body.id },
        select: { applicationDocumentId: true },
      }),
    ).resolves.toEqual({ applicationDocumentId: bridgedDocuments[0].id });

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/admissions/applications/${applicationId}/documents`,
      )
      .set('Authorization', bearer(schoolUserAuth))
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({
          applicationId,
          fileId: upload.body.file.id,
          documentType: 'Birth certificate',
          status: 'pending_review',
          file: {
            originalName: 'birth-submit.pdf',
            mimeType: 'application/pdf',
          },
        });
        expectNoSchoolDocumentLeaks(body);
      });

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/admissions/applications/${applicationId}/documents`,
      )
      .set('Authorization', bearer(otherSchoolUserAuth))
      .expect(404);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/admissions/applications/${applicationId}/documents`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(403);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/submit`)
      .set('Authorization', bearer(applicantAuth))
      .expect(200);
    await expect(
      prisma.applicationDocument.count({ where: { applicationId } }),
    ).resolves.toBe(1);
  });

  it('bridges post-submit DOCUMENTS_PENDING uploads immediately and denies bridged replace/delete', async () => {
    const requestId = (await createDraftRequest('Bridge Pending')).id;
    const firstUpload = await uploadDocument(requestId, {
      requiredDocumentId,
      filename: 'pending-birth.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('pending-birth'),
    }).expect(201);
    rememberDocumentAndFile(firstUpload.body);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/submit`)
      .set('Authorization', bearer(applicantAuth))
      .expect(200);
    const applicationId = await getApplicationIdForRequest(requestId);
    createdApplicationIds.push(applicationId);

    const secondUpload = await uploadDocument(requestId, {
      requiredDocumentId: secondRequiredDocumentId,
      filename: 'pending-parent.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('pending-parent'),
    }).expect(201);
    rememberDocumentAndFile(secondUpload.body);
    expectNoApplicantInternalFields(secondUpload.body);

    const linkedSecondDocument =
      await prisma.applicantAdmissionRequestDocument.findUniqueOrThrow({
        where: { id: secondUpload.body.id },
        select: { applicationDocumentId: true },
      });
    expect(linkedSecondDocument.applicationDocumentId).toEqual(
      expect.any(String),
    );
    await expect(
      prisma.applicationDocument.count({ where: { applicationId } }),
    ).resolves.toBe(2);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents/${firstUpload.body.id}/replacements`,
      )
      .set('Authorization', bearer(applicantAuth))
      .attach('file', Buffer.from('replacement'), {
        filename: 'replacement.pdf',
        contentType: 'application/pdf',
      })
      .expect(409);

    await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents/${firstUpload.body.id}`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(409);
  });

  it('creates no conversion, operational identity, enrollment, or applicant membership side effects', async () => {
    await expect(
      prisma.student.count({ where: { schoolId: activeSchoolId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.guardian.count({ where: { schoolId: activeSchoolId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.studentGuardian.count({ where: { schoolId: activeSchoolId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.enrollment.count({ where: { schoolId: activeSchoolId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.membership.count({
        where: {
          userId: applicantUserId,
          userType: UserType.APPLICANT,
        },
      }),
    ).resolves.toBe(0);
  });

  async function createOrganization(input: {
    slug: string;
    name: string;
  }): Promise<{ id: string }> {
    const organization = await prisma.organization.create({
      data: {
        slug: input.slug,
        name: input.name,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);
    return organization;
  }

  async function createSchoolWithProfile(input: {
    organizationId: string;
    slug: string;
    name: string;
    schoolName: string;
  }): Promise<string> {
    const school = await prisma.school.create({
      data: {
        organizationId: input.organizationId,
        slug: input.slug,
        name: input.name,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    const profile = await prisma.schoolProfile.create({
      data: {
        schoolId: school.id,
        schoolName: input.schoolName,
        city: 'Cairo',
        country: 'Egypt',
      },
      select: { id: true },
    });
    createdSchoolProfileIds.push(profile.id);

    return school.id;
  }

  async function createRequiredDocument(input: {
    schoolId: string;
    organizationId: string;
    title: string;
    sortOrder: number;
  }): Promise<string> {
    const document = await prisma.admissionRequiredDocument.create({
      data: {
        schoolId: input.schoolId,
        organizationId: input.organizationId,
        title: input.title,
        isMandatory: true,
        acceptedFileTypes: ['application/pdf'],
        maxFiles: 1,
        sortOrder: input.sortOrder,
      },
      select: { id: true },
    });
    createdDocumentIds.push(document.id);
    return document.id;
  }

  async function createAdmissionsViewerRole(
    schoolId: string,
    label: string,
  ): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId,
        key: `${marker}-admissions-${label}`,
        name: `Sprint 18M Admissions ${label}`,
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);

    const permission = await prisma.permission.upsert({
      where: { code: 'admissions.documents.view' },
      update: {},
      create: {
        code: 'admissions.documents.view',
        module: 'admissions',
        resource: 'documents',
        action: 'view',
        description: 'View admissions application documents',
      },
      select: { id: true },
    });
    await prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: permission.id },
    });

    return role.id;
  }

  async function createUserWithMembership(
    userType: UserType,
    label: string,
    membership: { schoolId: string; roleId: string },
  ): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `${marker}-${label}@example.test`,
        firstName: 'Sprint18M',
        lastName: label,
        userType,
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
        schoolId: membership.schoolId,
        roleId: membership.roleId,
        userType,
        status: MembershipStatus.ACTIVE,
      },
    });

    return user.id;
  }

  async function createApplicantAccount(label: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/accounts`)
      .send({
        fullName: `Sprint 18M ${label} Applicant`,
        email: `${marker}-${label}@example.test`,
        password: PASSWORD,
        phoneNumber: '+20 100 000 0000',
        city: 'Cairo',
        relationship: 'guardian',
      })
      .expect(201);

    createdUserIds.push(response.body.userId);
    createdProfileIds.push(response.body.applicantId);
    return response.body.userId;
  }

  async function createDraftRequest(childFirstName: string): Promise<{
    id: string;
  }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests`)
      .set('Authorization', bearer(applicantAuth))
      .send({ schoolId: activeSchoolId, childFirstName })
      .expect(201);

    createdRequestIds.push(response.body.id);
    return { id: response.body.id };
  }

  function uploadDocument(
    requestId: string,
    input: {
      requiredDocumentId?: string;
      title?: string;
      documentType?: string;
      filename: string;
      contentType: string;
      body: Buffer;
    },
  ) {
    const call = request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents`)
      .set('Authorization', bearer(applicantAuth))
      .attach('file', input.body, {
        filename: input.filename,
        contentType: input.contentType,
      });

    if (input.requiredDocumentId) {
      call.field('requiredDocumentId', input.requiredDocumentId);
    }
    if (input.title) call.field('title', input.title);
    if (input.documentType) call.field('documentType', input.documentType);

    return call;
  }

  async function getApplicationIdForRequest(
    requestId: string,
  ): Promise<string> {
    const requestRecord =
      await prisma.applicantAdmissionRequest.findUniqueOrThrow({
        where: { id: requestId },
        select: { applicationId: true },
      });
    expect(requestRecord.applicationId).toEqual(expect.any(String));
    return requestRecord.applicationId as string;
  }

  function rememberDocumentAndFile(body: {
    id: string;
    file?: { id?: string };
  }): void {
    createdApplicantDocumentIds.push(body.id);
    if (body.file?.id) createdFileIds.push(body.file.id);
  }

  async function login(email: string): Promise<AuthTokens> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  function bearer(tokens: AuthTokens): string {
    return `Bearer ${tokens.accessToken}`;
  }

  function expectNoApplicantInternalFields(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'organizationId',
      'schoolId',
      'applicantUserId',
      'applicantProfileId',
      'applicationId',
      'applicationDocumentId',
      'bucket',
      'objectKey',
      'signedUrl',
      'downloadUrl',
      'deletedAt',
      'UPLOADED',
      'PENDING_REVIEW',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }

  function expectNoSchoolDocumentLeaks(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'applicantUserId',
      'applicantProfileId',
      'bucket',
      'objectKey',
      'signedUrl',
      'downloadUrl',
      'PENDING_REVIEW',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }

  async function cleanupData(): Promise<void> {
    if (!prisma) return;

    const files = await prisma.file.findMany({
      where: { id: { in: createdFileIds } },
      select: { bucket: true, objectKey: true },
    });
    await Promise.all(
      files.map((file) =>
        storageService
          .deleteObject({ bucket: file.bucket, objectKey: file.objectKey })
          .catch(() => undefined),
      ),
    );

    await prisma.session.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: createdUserIds } },
          {
            resourceId: {
              in: [
                ...createdProfileIds,
                ...createdRequestIds,
                ...createdApplicantDocumentIds,
                ...createdApplicationIds,
              ],
            },
          },
          { schoolId: { in: createdSchoolIds } },
          { organizationId: { in: createdOrganizationIds } },
        ],
      },
    });
    await prisma.applicantAdmissionRequestDocument.deleteMany({
      where: { id: { in: createdApplicantDocumentIds } },
    });
    await prisma.applicationDocument.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.file.deleteMany({ where: { id: { in: createdFileIds } } });
    await prisma.applicantAdmissionRequest.deleteMany({
      where: { id: { in: createdRequestIds } },
    });
    await prisma.application.deleteMany({
      where: { id: { in: createdApplicationIds } },
    });
    await prisma.applicantProfile.deleteMany({
      where: { id: { in: createdProfileIds } },
    });
    await prisma.membership.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
    await prisma.admissionRequiredDocument.deleteMany({
      where: { id: { in: createdDocumentIds } },
    });
    await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
    await prisma.schoolProfile.deleteMany({
      where: { id: { in: createdSchoolProfileIds } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: createdSchoolIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrganizationIds } },
    });
  }
});
