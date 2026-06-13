import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AdmissionApplicationStatus,
  AdmissionDocumentStatus,
  ApplicantAdmissionRequestDocumentStatus,
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
const PASSWORD = 'Applicant19AReview!';
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

type ExpressLayer = {
  route?: {
    path?: string | string[];
    methods?: Record<string, boolean>;
  };
  handle?: {
    stack?: ExpressLayer[];
  };
};

describe('Applicant Portal document review (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageService: StorageService;

  let organizationId = '';
  let activeSchoolId = '';
  let requiredDocumentId = '';
  let roleId = '';
  let applicantUserId = '';

  let applicantAuth: AuthTokens;
  let schoolUserAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s19a-review-${suffix}`;
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
      name: `Sprint 19A Review Org ${suffix}`,
    });
    organizationId = organization.id;

    activeSchoolId = await createSchoolWithProfile({
      organizationId,
      slug: `${marker}-school`,
      name: `${marker} School`,
      schoolName: `${marker} Public School`,
    });

    requiredDocumentId = await createRequiredDocument({
      schoolId: activeSchoolId,
      organizationId,
      title: 'Birth certificate',
      sortOrder: 10,
    });

    roleId = await createAdmissionsDocumentManagerRole();
    await createUserWithMembership(UserType.SCHOOL_USER, 'school-user');

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
  });

  afterAll(async () => {
    try {
      await cleanupData();
      if (app) await app.close();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers the three school-side review routes and keeps deferred routes absent', () => {
    const routes = listRegisteredRoutes();

    for (const implementedRoute of [
      'POST /api/v1/admissions/applications/:applicationId/documents/:documentId/accept',
      'POST /api/v1/admissions/applications/:applicationId/documents/:documentId/reject',
      'POST /api/v1/admissions/applications/:applicationId/documents/:documentId/request-replacement',
    ]) {
      expect(routes).toContain(implementedRoute);
    }

    for (const absentRoute of [
      'POST /api/v1/applicant-portal/requests/:requestId/convert-to-parent',
      'POST /api/v1/applicant-portal/requests/:requestId/convert-to-guardian',
      'POST /api/v1/applicant-portal/requests/:requestId/convert-to-student',
      'POST /api/v1/applicant-portal/requests/:requestId/convert-to-enrollment',
      'POST /api/v1/applicant-portal/conversions',
      'POST /api/v1/applicant-portal/uploads',
      'POST /api/v1/admissions/applications/:applicationId/documents/:documentId/reopen',
      'POST /api/v1/admissions/applications/:applicationId/documents/reopen-collection',
      'POST /api/v1/admissions/applications/:applicationId/documents/:documentId/notify',
      'DELETE /api/v1/admissions/applications/:applicationId/documents/:documentId/purge-file',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }
  });

  it('school admin accepts a pending applicant document', async () => {
    const fixture = await createSubmittedApplicantDocument('Accept');

    const response = await reviewDocument(
      'accept',
      fixture.applicationId,
      fixture.applicationDocumentId,
      { note: 'Verified' },
    ).expect(200);

    expect(response.body).toMatchObject({
      id: fixture.applicationDocumentId,
      applicationId: fixture.applicationId,
      fileId: fixture.fileId,
      documentType: 'Birth certificate',
      status: 'complete',
      notes: 'Verified',
      file: { id: fixture.fileId, originalName: 'accept.pdf' },
    });
    expectNoSchoolDocumentLeaks(response.body);
    await expectDocumentStatuses(fixture, {
      applicationDocumentStatus: AdmissionDocumentStatus.COMPLETE,
      applicantDocumentStatus: ApplicantAdmissionRequestDocumentStatus.ACCEPTED,
      applicationStatus: AdmissionApplicationStatus.SUBMITTED,
    });
  });

  it('school admin rejects a pending applicant document without opening replacement', async () => {
    const fixture = await createSubmittedApplicantDocument('Reject');

    await reviewDocument(
      'reject',
      fixture.applicationId,
      fixture.applicationDocumentId,
      { note: 'Blurry scan' },
    )
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('missing');
        expect(body.notes).toBe('Blurry scan');
        expectNoSchoolDocumentLeaks(body);
      });
    await expectDocumentStatuses(fixture, {
      applicationDocumentStatus: AdmissionDocumentStatus.MISSING,
      applicantDocumentStatus: ApplicantAdmissionRequestDocumentStatus.REJECTED,
      applicationStatus: AdmissionApplicationStatus.SUBMITTED,
    });

    await replaceDocument(
      fixture.requestId,
      fixture.applicantDocumentId,
      'reject-replacement.pdf',
    ).expect(409);
  });

  it('requests replacement, lets applicant replace once, and re-bridges as pending review', async () => {
    const fixture = await createSubmittedApplicantDocument('Replacement');
    const beforeApplications = await prisma.application.count({
      where: { id: fixture.applicationId },
    });
    const beforeDocuments = await prisma.applicationDocument.count({
      where: { applicationId: fixture.applicationId },
    });

    await reviewDocument(
      'request-replacement',
      fixture.applicationId,
      fixture.applicationDocumentId,
      { note: 'Wrong document' },
    )
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('missing');
        expect(body.notes).toBe('Wrong document');
        expectNoSchoolDocumentLeaks(body);
      });
    await expectDocumentStatuses(fixture, {
      applicationDocumentStatus: AdmissionDocumentStatus.MISSING,
      applicantDocumentStatus:
        ApplicantAdmissionRequestDocumentStatus.NEEDS_REPLACEMENT,
      applicationStatus: AdmissionApplicationStatus.DOCUMENTS_PENDING,
    });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/requests/${fixture.requestId}`)
      .set('Authorization', bearer(applicantAuth))
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('needs_action');
        expect(body.missingItemsCount).toBe(1);
        expectNoApplicantInternalFields(body);
      });

    const replacement = await replaceDocument(
      fixture.requestId,
      fixture.applicantDocumentId,
      'replacement.pdf',
    )
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('uploaded');
        expect(body.file.originalName).toBe('replacement.pdf');
        expectNoApplicantInternalFields(body);
      });
    rememberDocumentAndFile(replacement.body);

    await expect(
      prisma.applicantAdmissionRequestDocument.findUnique({
        where: { id: fixture.applicantDocumentId },
        select: { status: true },
      }),
    ).resolves.toEqual({
      status: ApplicantAdmissionRequestDocumentStatus.SUPERSEDED,
    });

    const replacementLink =
      await prisma.applicantAdmissionRequestDocument.findUniqueOrThrow({
        where: { id: replacement.body.id },
        select: {
          status: true,
          applicationDocumentId: true,
          applicationDocument: {
            select: { status: true, applicationId: true, fileId: true },
          },
        },
      });
    expect(replacementLink).toMatchObject({
      status: ApplicantAdmissionRequestDocumentStatus.UPLOADED,
      applicationDocument: {
        status: AdmissionDocumentStatus.PENDING_REVIEW,
        applicationId: fixture.applicationId,
        fileId: replacement.body.file.id,
      },
    });
    expect(replacementLink.applicationDocumentId).not.toBe(
      fixture.applicationDocumentId,
    );

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/admissions/applications/${fixture.applicationId}/documents`,
      )
      .set('Authorization', bearer(schoolUserAuth))
      .expect(200)
      .expect(({ body }) => {
        const pending = body.find(
          (item: { id: string }) =>
            item.id === replacementLink.applicationDocumentId,
        );
        expect(pending).toMatchObject({
          status: 'pending_review',
          fileId: replacement.body.file.id,
        });
        expectNoSchoolDocumentLeaks(body);
      });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests/${fixture.requestId}/submit`)
      .set('Authorization', bearer(applicantAuth))
      .expect(200);
    await expect(
      prisma.application.count({ where: { id: fixture.applicationId } }),
    ).resolves.toBe(beforeApplications);
    await expect(
      prisma.applicationDocument.count({
        where: { applicationId: fixture.applicationId },
      }),
    ).resolves.toBe(beforeDocuments + 1);
  });

  it('creates no student, guardian, enrollment, membership, parent, or notification side effects', async () => {
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
        where: { userId: applicantUserId, userType: UserType.APPLICANT },
      }),
    ).resolves.toBe(0);
  });

  async function createSubmittedApplicantDocument(childFirstName: string): Promise<{
    requestId: string;
    applicantDocumentId: string;
    applicationId: string;
    applicationDocumentId: string;
    fileId: string;
  }> {
    const requestId = (await createDraftRequest(childFirstName)).id;
    const upload = await uploadDocument(requestId, {
      requiredDocumentId,
      filename: `${childFirstName.toLowerCase()}.pdf`,
      body: Buffer.from(`${childFirstName.toLowerCase()}-document`),
    }).expect(201);
    rememberDocumentAndFile(upload.body);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/submit`)
      .set('Authorization', bearer(applicantAuth))
      .expect(200)
      .expect(({ body }) => expectNoApplicantInternalFields(body));

    const applicationId = await getApplicationIdForRequest(requestId);
    createdApplicationIds.push(applicationId);
    const applicationDocument =
      await prisma.applicationDocument.findFirstOrThrow({
        where: {
          applicationId,
          applicantAdmissionRequestDocuments: {
            some: { id: upload.body.id },
          },
        },
        select: { id: true, status: true },
      });
    expect(applicationDocument.status).toBe(
      AdmissionDocumentStatus.PENDING_REVIEW,
    );

    return {
      requestId,
      applicantDocumentId: upload.body.id,
      applicationId,
      applicationDocumentId: applicationDocument.id,
      fileId: upload.body.file.id,
    };
  }

  function reviewDocument(
    action: 'accept' | 'reject' | 'request-replacement',
    applicationId: string,
    documentId: string,
    body: { note?: string },
  ) {
    return request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/admissions/applications/${applicationId}/documents/${documentId}/${action}`,
      )
      .set('Authorization', bearer(schoolUserAuth))
      .send(body);
  }

  async function expectDocumentStatuses(
    fixture: {
      applicantDocumentId: string;
      applicationDocumentId: string;
      applicationId: string;
    },
    expected: {
      applicationDocumentStatus: AdmissionDocumentStatus;
      applicantDocumentStatus: ApplicantAdmissionRequestDocumentStatus;
      applicationStatus: AdmissionApplicationStatus;
    },
  ): Promise<void> {
    await expect(
      prisma.applicationDocument.findUnique({
        where: { id: fixture.applicationDocumentId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: expected.applicationDocumentStatus });
    await expect(
      prisma.applicantAdmissionRequestDocument.findUnique({
        where: { id: fixture.applicantDocumentId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: expected.applicantDocumentStatus });
    await expect(
      prisma.application.findUnique({
        where: { id: fixture.applicationId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: expected.applicationStatus });
  }

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

  async function createAdmissionsDocumentManagerRole(): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId: activeSchoolId,
        key: `${marker}-admissions-documents-manager`,
        name: `Sprint 19A Admissions Documents Manager ${suffix}`,
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);

    for (const permissionCode of [
      'admissions.documents.view',
      'admissions.documents.manage',
    ]) {
      const permission = await prisma.permission.upsert({
        where: { code: permissionCode },
        update: {},
        create: {
          code: permissionCode,
          module: 'admissions',
          resource: 'documents',
          action: permissionCode.endsWith('.manage') ? 'manage' : 'view',
          description: `Admissions documents ${permissionCode.split('.').pop()}`,
        },
        select: { id: true },
      });
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      });
    }

    return role.id;
  }

  async function createUserWithMembership(
    userType: UserType,
    label: string,
  ): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `${marker}-${label}@example.test`,
        firstName: 'Sprint19A',
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
        schoolId: activeSchoolId,
        roleId,
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
        fullName: `Sprint 19A ${label} Applicant`,
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

  async function createDraftRequest(
    childFirstName: string,
  ): Promise<{ id: string }> {
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
      filename: string;
      body: Buffer;
    },
  ) {
    const call = request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents`)
      .set('Authorization', bearer(applicantAuth))
      .attach('file', input.body, {
        filename: input.filename,
        contentType: 'application/pdf',
      });

    if (input.requiredDocumentId) {
      call.field('requiredDocumentId', input.requiredDocumentId);
    }

    return call;
  }

  function replaceDocument(
    requestId: string,
    documentId: string,
    filename: string,
  ) {
    return request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents/${documentId}/replacements`,
      )
      .set('Authorization', bearer(applicantAuth))
      .attach('file', Buffer.from(`${filename}-body`), {
        filename,
        contentType: 'application/pdf',
      });
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
      'storage',
      'deletedAt',
      'UPLOADED',
      'PENDING_REVIEW',
      'NEEDS_REPLACEMENT',
      'SUPERSEDED',
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
      'NEEDS_REPLACEMENT',
      'SUPERSEDED',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }

  function listRegisteredRoutes(): string[] {
    const expressApp = app.getHttpAdapter().getInstance() as {
      _router?: { stack?: ExpressLayer[] };
      router?: { stack?: ExpressLayer[] };
    };
    const stack = expressApp._router?.stack ?? expressApp.router?.stack ?? [];
    const routes: string[] = [];

    collectRoutes(stack, routes);

    return routes.sort();
  }

  function collectRoutes(layers: ExpressLayer[], routes: string[]): void {
    for (const layer of layers) {
      if (layer.route?.path && layer.route.methods) {
        const paths = Array.isArray(layer.route.path)
          ? layer.route.path
          : [layer.route.path];
        const methods = Object.entries(layer.route.methods)
          .filter(([, enabled]) => enabled)
          .map(([method]) => method.toUpperCase());

        for (const path of paths) {
          for (const method of methods) {
            routes.push(`${method} ${normalizeRoutePath(path)}`);
          }
        }
      }

      if (layer.handle?.stack) {
        collectRoutes(layer.handle.stack, routes);
      }
    }
  }

  function normalizeRoutePath(path: string): string {
    return `/${path}`.replace(/\/{2,}/g, '/');
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
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.admissionRequiredDocument.deleteMany({
      where: { id: { in: createdDocumentIds } },
    });
    await prisma.rolePermission.deleteMany({
      where: { roleId: { in: createdRoleIds } },
    });
    await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
    await prisma.schoolProfile.deleteMany({
      where: { id: { in: createdSchoolProfileIds } },
    });
    await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrganizationIds } },
    });
  }
});
