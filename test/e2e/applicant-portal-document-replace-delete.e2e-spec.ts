import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AdmissionApplicationStatus,
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
const PASSWORD = 'Applicant18LDocs!';
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

describe('Applicant Portal document replace/delete (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageService: StorageService;

  let organizationId = '';
  let activeSchoolId = '';
  let requiredDocumentId = '';
  let secondRequiredDocumentId = '';
  let roleId = '';
  let primaryUserId = '';
  let otherApplicantUserId = '';

  let applicantAuth: AuthTokens;
  let otherApplicantAuth: AuthTokens;
  let parentAuth: AuthTokens;
  let studentAuth: AuthTokens;
  let teacherAuth: AuthTokens;
  let schoolUserAuth: AuthTokens;
  let platformAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s18l-docmut-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdSchoolProfileIds: string[] = [];
  const createdDocumentIds: string[] = [];
  const createdRequestIds: string[] = [];
  const createdApplicationIds: string[] = [];
  const createdApplicantDocumentIds: string[] = [];
  const createdFileIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdApplicantUserIds: string[] = [];
  const createdProfileIds: string[] = [];
  const createdRoleIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await createOrganization({
      slug: `${marker}-org`,
      name: `Sprint 18L Mutation Org ${suffix}`,
      status: OrganizationStatus.ACTIVE,
    });
    organizationId = organization.id;

    activeSchoolId = await createSchoolWithProfile({
      organizationId,
      slug: `${marker}-school`,
      name: `${marker} Active Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Active Public`,
    });

    requiredDocumentId = await createRequiredDocument({
      schoolId: activeSchoolId,
      organizationId,
      title: 'Birth certificate',
      isMandatory: true,
      sortOrder: 10,
    });
    secondRequiredDocumentId = await createRequiredDocument({
      schoolId: activeSchoolId,
      organizationId,
      title: 'Parent ID',
      isMandatory: true,
      sortOrder: 20,
    });

    roleId = (
      await prisma.role.create({
        data: {
          schoolId: activeSchoolId,
          key: `${marker}-role`,
          name: `Sprint 18L Role ${suffix}`,
          isSystem: false,
        },
        select: { id: true },
      })
    ).id;
    createdRoleIds.push(roleId);

    await createUserWithMembership(UserType.PARENT, 'parent');
    await createUserWithMembership(UserType.STUDENT, 'student');
    await createUserWithMembership(UserType.TEACHER, 'teacher');
    await createUserWithMembership(UserType.SCHOOL_USER, 'school-user');
    await createMembershiplessUser(UserType.PLATFORM_USER, 'platform');

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

    primaryUserId = await createApplicantAccount('primary');
    otherApplicantUserId = await createApplicantAccount('other');

    applicantAuth = await login(`${marker}-primary@example.test`);
    otherApplicantAuth = await login(`${marker}-other@example.test`);
    parentAuth = await login(`${marker}-parent@example.test`);
    studentAuth = await login(`${marker}-student@example.test`);
    teacherAuth = await login(`${marker}-teacher@example.test`);
    schoolUserAuth = await login(`${marker}-school-user@example.test`);
    platformAuth = await login(`${marker}-platform@example.test`);
  });

  afterAll(async () => {
    try {
      await cleanupData();
      if (app) await app.close();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers replacement/delete routes and keeps deferred routes absent', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toContain(
      'POST /api/v1/applicant-portal/requests/:requestId/documents/:documentId/replacements',
    );
    expect(routes).toContain(
      'DELETE /api/v1/applicant-portal/requests/:requestId/documents/:documentId',
    );
    expect(routes).not.toContain(
      'PATCH /api/v1/applicant-portal/requests/:requestId/documents/:documentId',
    );
    expect(routes).not.toContain(
      'POST /api/v1/applicant-portal/requests/:requestId/documents/:documentId/bridge',
    );
    expect(routes).not.toContain(
      'POST /api/v1/applicant-portal/requests/:requestId/convert-to-parent',
    );
  });

  it('replaces an own required document append-only and keeps missingItemsCount satisfied', async () => {
    const requestId = (
      await createDraftRequest(applicantAuth, activeSchoolId, 'Layla')
    ).id;
    const oldUpload = await uploadDocument(applicantAuth, requestId, {
      requiredDocumentId,
      filename: 'birth-certificate.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('birth-original'),
    }).expect(201);
    const secondUpload = await uploadDocument(applicantAuth, requestId, {
      requiredDocumentId: secondRequiredDocumentId,
      filename: 'parent-id.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('parent-id'),
    }).expect(201);
    rememberDocumentAndFile(oldUpload.body);
    rememberDocumentAndFile(secondUpload.body);

    await expectMissingItems(requestId, applicantAuth, 0);

    const oldDocumentId = oldUpload.body.id;
    const oldFileId = oldUpload.body.file.id;
    const replacement = await replaceDocument(
      applicantAuth,
      requestId,
      oldDocumentId,
      {
        filename: 'birth-replacement.pdf',
        contentType: 'application/pdf',
        body: Buffer.from('birth-replacement'),
        notes: 'Updated copy.',
      },
    ).expect(201);
    rememberDocumentAndFile(replacement.body);

    expect(replacement.body).toMatchObject({
      requestId,
      status: 'uploaded',
      title: 'Birth certificate',
      documentType: 'Birth certificate',
      requiredDocument: { id: requiredDocumentId },
      file: {
        originalName: 'birth-replacement.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 17,
      },
      notes: 'Updated copy.',
    });
    expect(replacement.body.id).not.toBe(oldDocumentId);
    expect(replacement.body.file.id).not.toBe(oldFileId);
    expectNoInternalDocumentFields(replacement.body);

    await expect(
      prisma.applicantAdmissionRequestDocument.findUnique({
        where: { id: oldDocumentId },
        select: { status: true, fileId: true, deletedAt: true },
      }),
    ).resolves.toEqual({
      status: ApplicantAdmissionRequestDocumentStatus.SUPERSEDED,
      fileId: oldFileId,
      deletedAt: null,
    });
    await expect(
      prisma.applicantAdmissionRequestDocument.findUnique({
        where: { id: replacement.body.id },
        select: {
          status: true,
          requiredDocumentId: true,
          applicationDocumentId: true,
          deletedAt: true,
        },
      }),
    ).resolves.toEqual({
      status: ApplicantAdmissionRequestDocumentStatus.UPLOADED,
      requiredDocumentId,
      applicationDocumentId: null,
      deletedAt: null,
    });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents`)
      .set('Authorization', bearer(applicantAuth))
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.map((item: { id: string }) => item.id)).toContain(
          replacement.body.id,
        );
        expect(body.data.map((item: { id: string }) => item.id)).not.toContain(
          oldDocumentId,
        );
        expectNoInternalDocumentFields(body);
      });

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents/${oldDocumentId}`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents/${oldDocumentId}/download`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);

    const downloadResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents/${replacement.body.id}/download`,
      )
      .set('Authorization', bearer(applicantAuth))
      .redirects(0)
      .expect(307);
    expect(downloadResponse.headers.location).toContain('X-Amz-Expires=300');
    const signedDownloadResponse = await fetch(
      downloadResponse.headers.location,
    );
    expect(signedDownloadResponse.status).toBe(200);
    await expect(signedDownloadResponse.text()).resolves.toBe(
      'birth-replacement',
    );

    await expectMissingItems(requestId, applicantAuth, 0);
  });

  it('replaces an own optional document and keeps response metadata safe', async () => {
    const requestId = (
      await createDraftRequest(applicantAuth, activeSchoolId, 'Nour')
    ).id;
    const optionalUpload = await uploadDocument(applicantAuth, requestId, {
      title: 'Health note',
      documentType: 'health_note',
      filename: 'health-note.txt',
      contentType: 'text/plain',
      body: Buffer.from('old-note'),
    }).expect(201);
    rememberDocumentAndFile(optionalUpload.body);

    const replacement = await replaceDocument(
      applicantAuth,
      requestId,
      optionalUpload.body.id,
      {
        title: 'Updated health note',
        filename: 'updated-health-note.txt',
        contentType: 'text/plain',
        body: Buffer.from('new-note'),
      },
    ).expect(201);
    rememberDocumentAndFile(replacement.body);

    expect(replacement.body).toMatchObject({
      status: 'uploaded',
      title: 'Updated health note',
      documentType: 'health_note',
      requiredDocument: null,
    });
    expectNoInternalDocumentFields(replacement.body);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents`)
      .set('Authorization', bearer(applicantAuth))
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.map((item: { id: string }) => item.id)).toContain(
          replacement.body.id,
        );
        expect(body.data.map((item: { id: string }) => item.id)).not.toContain(
          optionalUpload.body.id,
        );
        expectNoInternalDocumentFields(body);
      });
  });

  it('soft-deletes an own draft document and makes a required item missing again', async () => {
    const requestId = (
      await createDraftRequest(applicantAuth, activeSchoolId, 'Farah')
    ).id;
    const upload = await uploadDocument(applicantAuth, requestId, {
      requiredDocumentId,
      filename: 'birth-delete.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('delete-me'),
    }).expect(201);
    rememberDocumentAndFile(upload.body);

    await expectMissingItems(requestId, applicantAuth, 1);

    await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents/${upload.body.id}`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ ok: true }));

    const deletedDocument =
      await prisma.applicantAdmissionRequestDocument.findUniqueOrThrow({
        where: { id: upload.body.id },
        select: { deletedAt: true, fileId: true },
      });
    expect(deletedDocument.deletedAt).toBeInstanceOf(Date);
    expect(deletedDocument.fileId).toBe(upload.body.file.id);
    await expect(
      prisma.file.findUnique({ where: { id: upload.body.file.id } }),
    ).resolves.toMatchObject({ id: upload.body.file.id, deletedAt: null });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents`)
      .set('Authorization', bearer(applicantAuth))
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.map((item: { id: string }) => item.id)).not.toContain(
          upload.body.id,
        );
        expectNoInternalDocumentFields(body);
      });
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents/${upload.body.id}`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents/${upload.body.id}/download`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);

    await expectMissingItems(requestId, applicantAuth, 2);
  });

  it('denies replacement/delete across applicant ownership boundaries and for non-applicant actors', async () => {
    const requestId = (
      await createDraftRequest(applicantAuth, activeSchoolId, 'Youssef')
    ).id;
    const upload = await uploadDocument(applicantAuth, requestId, {
      requiredDocumentId,
      filename: 'own.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('own'),
    }).expect(201);
    rememberDocumentAndFile(upload.body);

    const otherRequestId = (
      await createDraftRequest(otherApplicantAuth, activeSchoolId, 'Omar')
    ).id;
    const otherUpload = await uploadDocument(
      otherApplicantAuth,
      otherRequestId,
      {
        requiredDocumentId,
        filename: 'other.pdf',
        contentType: 'application/pdf',
        body: Buffer.from('other'),
      },
    ).expect(201);
    rememberDocumentAndFile(otherUpload.body);

    await replaceDocument(applicantAuth, otherRequestId, otherUpload.body.id, {
      filename: 'cross.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('cross'),
    }).expect(404);
    await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${otherRequestId}/documents/${otherUpload.body.id}`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);

    await replaceDocument(otherApplicantAuth, requestId, upload.body.id, {
      filename: 'cross.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('cross'),
    }).expect(404);
    await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents/${upload.body.id}`,
      )
      .set('Authorization', bearer(otherApplicantAuth))
      .expect(404);

    for (const auth of [
      parentAuth,
      studentAuth,
      teacherAuth,
      schoolUserAuth,
      platformAuth,
    ]) {
      await replaceDocument(auth, requestId, upload.body.id, {
        filename: 'denied.pdf',
        contentType: 'application/pdf',
        body: Buffer.from('denied'),
      }).expect(403);
      await request(app.getHttpServer())
        .delete(
          `${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents/${upload.body.id}`,
        )
        .set('Authorization', bearer(auth))
        .expect(403);
    }
  });

  it('rejects replacement/delete after the application leaves document collection', async () => {
    for (const applicationStatus of [
      AdmissionApplicationStatus.SUBMITTED,
      AdmissionApplicationStatus.UNDER_REVIEW,
      AdmissionApplicationStatus.WAITLISTED,
      AdmissionApplicationStatus.ACCEPTED,
      AdmissionApplicationStatus.REJECTED,
    ]) {
      const requestId = (
        await createDraftRequest(
          applicantAuth,
          activeSchoolId,
          applicationStatus,
        )
      ).id;
      const upload = await uploadDocument(applicantAuth, requestId, {
        requiredDocumentId,
        filename: `${applicationStatus.toLowerCase()}-birth.pdf`,
        contentType: 'application/pdf',
        body: Buffer.from(applicationStatus),
      }).expect(201);
      const secondUpload = await uploadDocument(applicantAuth, requestId, {
        requiredDocumentId: secondRequiredDocumentId,
        filename: `${applicationStatus.toLowerCase()}-parent.pdf`,
        contentType: 'application/pdf',
        body: Buffer.from(`${applicationStatus}-parent`),
      }).expect(201);
      rememberDocumentAndFile(upload.body);
      rememberDocumentAndFile(secondUpload.body);

      const submitResponse = await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/submit`)
        .set('Authorization', bearer(applicantAuth))
        .expect(200);
      const applicationId =
        submitResponse.body.applicationId ??
        (
          await prisma.applicantAdmissionRequest.findUniqueOrThrow({
            where: { id: requestId },
            select: { applicationId: true },
          })
        ).applicationId;
      createdApplicationIds.push(applicationId);

      if (applicationStatus !== AdmissionApplicationStatus.SUBMITTED) {
        await prisma.application.update({
          where: { id: applicationId },
          data: { status: applicationStatus },
        });
      }

      await replaceDocument(applicantAuth, requestId, upload.body.id, {
        filename: `${applicationStatus.toLowerCase()}-replacement.pdf`,
        contentType: 'application/pdf',
        body: Buffer.from('replacement'),
      }).expect(409);
      await request(app.getHttpServer())
        .delete(
          `${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents/${upload.body.id}`,
        )
        .set('Authorization', bearer(applicantAuth))
        .expect(409);
    }
  });

  it('does not create bridge, conversion, operational identity, enrollment, or applicant membership side effects', async () => {
    await expect(
      prisma.applicationDocument.count({ where: { schoolId: activeSchoolId } }),
    ).resolves.toBe(0);
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
          userId: { in: [primaryUserId, otherApplicantUserId] },
          userType: UserType.APPLICANT,
        },
      }),
    ).resolves.toBe(0);
  });

  async function createOrganization(input: {
    slug: string;
    name: string;
    status: OrganizationStatus;
  }): Promise<{ id: string }> {
    const organization = await prisma.organization.create({
      data: {
        slug: input.slug,
        name: input.name,
        status: input.status,
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
    status: SchoolStatus;
    schoolName: string;
  }): Promise<string> {
    const school = await prisma.school.create({
      data: {
        organizationId: input.organizationId,
        slug: input.slug,
        name: input.name,
        status: input.status,
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
    isMandatory: boolean;
    sortOrder: number;
  }): Promise<string> {
    const document = await prisma.admissionRequiredDocument.create({
      data: {
        schoolId: input.schoolId,
        organizationId: input.organizationId,
        title: input.title,
        isMandatory: input.isMandatory,
        acceptedFileTypes: ['application/pdf'],
        maxFiles: 1,
        sortOrder: input.sortOrder,
      },
      select: { id: true },
    });
    createdDocumentIds.push(document.id);
    return document.id;
  }

  async function createApplicantAccount(label: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/accounts`)
      .send({
        fullName: `Sprint 18L ${label} Applicant`,
        email: `${marker}-${label}@example.test`,
        password: PASSWORD,
        phoneNumber: '+20 100 000 0000',
        city: 'Cairo',
        relationship: 'guardian',
      })
      .expect(201);

    createdUserIds.push(response.body.userId);
    createdApplicantUserIds.push(response.body.userId);
    createdProfileIds.push(response.body.applicantId);
    return response.body.userId;
  }

  async function createDraftRequest(
    auth: AuthTokens,
    schoolId: string,
    childFirstName: string,
  ): Promise<{ id: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests`)
      .set('Authorization', bearer(auth))
      .send({ schoolId, childFirstName })
      .expect(201);

    createdRequestIds.push(response.body.id);
    return { id: response.body.id };
  }

  function uploadDocument(
    auth: AuthTokens,
    requestId: string,
    input: {
      requiredDocumentId?: string;
      title?: string;
      documentType?: string;
      notes?: string;
      filename: string;
      contentType: string;
      body: Buffer;
    },
  ) {
    const call = request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents`)
      .set('Authorization', bearer(auth))
      .attach('file', input.body, {
        filename: input.filename,
        contentType: input.contentType,
      });

    if (input.requiredDocumentId) {
      call.field('requiredDocumentId', input.requiredDocumentId);
    }
    if (input.title) call.field('title', input.title);
    if (input.documentType) call.field('documentType', input.documentType);
    if (input.notes) call.field('notes', input.notes);

    return call;
  }

  function replaceDocument(
    auth: AuthTokens,
    requestId: string,
    documentId: string,
    input: {
      title?: string;
      documentType?: string;
      notes?: string;
      filename: string;
      contentType: string;
      body: Buffer;
    },
  ) {
    const call = request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents/${documentId}/replacements`,
      )
      .set('Authorization', bearer(auth))
      .attach('file', input.body, {
        filename: input.filename,
        contentType: input.contentType,
      });

    if (input.title) call.field('title', input.title);
    if (input.documentType) call.field('documentType', input.documentType);
    if (input.notes) call.field('notes', input.notes);

    return call;
  }

  async function expectMissingItems(
    requestId: string,
    auth: AuthTokens,
    count: number,
  ): Promise<void> {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}`)
      .set('Authorization', bearer(auth))
      .expect(200)
      .expect(({ body }) => {
        expect(body.missingItemsCount).toBe(count);
        expect(body.progressValue).toEqual(expect.any(Number));
      });
  }

  function rememberDocumentAndFile(body: {
    id: string;
    file?: { id?: string };
  }): void {
    createdApplicantDocumentIds.push(body.id);
    if (body.file?.id) createdFileIds.push(body.file.id);
  }

  async function createUserWithMembership(
    userType: UserType,
    label: string,
  ): Promise<void> {
    const userId = await createMembershiplessUser(userType, label);
    await prisma.membership.create({
      data: {
        userId,
        organizationId,
        schoolId: activeSchoolId,
        roleId,
        userType,
        status: MembershipStatus.ACTIVE,
      },
    });
  }

  async function createMembershiplessUser(
    userType: UserType,
    label: string,
  ): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `${marker}-${label}@example.test`,
        firstName: 'Sprint18L',
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
    return user.id;
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

  function expectNoInternalDocumentFields(body: unknown): void {
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
      'ACCEPTED',
      'REJECTED',
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
