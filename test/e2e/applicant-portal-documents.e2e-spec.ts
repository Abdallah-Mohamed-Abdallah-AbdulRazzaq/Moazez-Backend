import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AdmissionApplicationSource,
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
const PASSWORD = 'Applicant18IDocs!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(60000);

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

type SideEffectSnapshot = {
  memberships: number;
  applicationDocuments: number;
  applicantDocuments: number;
  files: number;
  students: number;
  guardians: number;
  studentGuardianLinks: number;
  enrollments: number;
};

describe('Applicant Portal documents (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageService: StorageService;

  let organizationId = '';
  let organizationToSuspendId = '';
  let activeSchoolId = '';
  let otherSchoolId = '';
  let schoolToSuspendId = '';
  let orgUnsafeSchoolId = '';
  let requiredDocumentId = '';
  let secondRequiredDocumentId = '';
  let inactiveRequiredDocumentId = '';
  let crossSchoolRequiredDocumentId = '';
  let roleId = '';
  let applicantRequestId = '';
  let otherApplicantRequestId = '';
  let requiredUploadDocumentId = '';
  let requiredUploadFileId = '';
  let optionalUploadDocumentId = '';

  let applicantAuth: AuthTokens;
  let otherApplicantAuth: AuthTokens;
  let parentAuth: AuthTokens;
  let studentAuth: AuthTokens;
  let teacherAuth: AuthTokens;
  let schoolUserAuth: AuthTokens;
  let platformAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s18i-documents-${suffix}`;
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

    const activeOrganization = await createOrganization({
      slug: `${marker}-active-org`,
      name: `Sprint 18I Active Org ${suffix}`,
      status: OrganizationStatus.ACTIVE,
    });
    organizationId = activeOrganization.id;
    const organizationToSuspend = await createOrganization({
      slug: `${marker}-org-to-suspend`,
      name: `Sprint 18I Org To Suspend ${suffix}`,
      status: OrganizationStatus.ACTIVE,
    });
    organizationToSuspendId = organizationToSuspend.id;

    activeSchoolId = await createSchoolWithProfile({
      organizationId,
      slug: `${marker}-active`,
      name: `${marker} Active Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Active Public`,
    });
    otherSchoolId = await createSchoolWithProfile({
      organizationId,
      slug: `${marker}-other`,
      name: `${marker} Other Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Other Public`,
    });
    schoolToSuspendId = await createSchoolWithProfile({
      organizationId,
      slug: `${marker}-school-to-suspend`,
      name: `${marker} School To Suspend`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} School To Suspend Public`,
    });
    orgUnsafeSchoolId = await createSchoolWithProfile({
      organizationId: organizationToSuspendId,
      slug: `${marker}-org-unsafe-school`,
      name: `${marker} Org Unsafe School`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Org Unsafe Public`,
    });

    requiredDocumentId = await createRequiredDocument({
      schoolId: activeSchoolId,
      organizationId,
      title: 'Birth certificate',
      isMandatory: true,
      sortOrder: 10,
      acceptedFileTypes: ['application/pdf'],
    });
    secondRequiredDocumentId = await createRequiredDocument({
      schoolId: activeSchoolId,
      organizationId,
      title: 'Parent ID',
      isMandatory: true,
      sortOrder: 20,
      acceptedFileTypes: ['application/pdf'],
    });
    inactiveRequiredDocumentId = await createRequiredDocument({
      schoolId: activeSchoolId,
      organizationId,
      title: 'Inactive document',
      isMandatory: true,
      isActive: false,
      acceptedFileTypes: ['application/pdf'],
    });
    crossSchoolRequiredDocumentId = await createRequiredDocument({
      schoolId: otherSchoolId,
      organizationId,
      title: 'Other school document',
      isMandatory: true,
      acceptedFileTypes: ['application/pdf'],
    });

    roleId = (
      await prisma.role.create({
        data: {
          schoolId: activeSchoolId,
          key: `${marker}-role`,
          name: `Sprint 18I Role ${suffix}`,
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

    await createApplicantAccount('primary');
    await createApplicantAccount('other');

    applicantAuth = await login(`${marker}-primary@example.test`);
    otherApplicantAuth = await login(`${marker}-other@example.test`);
    parentAuth = await login(`${marker}-parent@example.test`);
    studentAuth = await login(`${marker}-student@example.test`);
    teacherAuth = await login(`${marker}-teacher@example.test`);
    schoolUserAuth = await login(`${marker}-school-user@example.test`);
    platformAuth = await login(`${marker}-platform@example.test`);

    applicantRequestId = (
      await createDraftRequest(applicantAuth, activeSchoolId, 'Layla')
    ).id;
    otherApplicantRequestId = (
      await createDraftRequest(otherApplicantAuth, activeSchoolId, 'Omar')
    ).id;
  });

  afterAll(async () => {
    try {
      await cleanupData();
      if (app) await app.close();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers applicant upload/list/read routes and keeps deferred routes absent', async () => {
    const routes = listRegisteredRoutes();

    expect(routes).toContain(
      'POST /api/v1/applicant-portal/requests/:requestId/documents',
    );
    expect(routes).toContain(
      'GET /api/v1/applicant-portal/requests/:requestId/documents',
    );
    expect(routes).toContain(
      'GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId',
    );
    expect(routes).toContain(
      'GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId/download',
    );
    expect(routes).toContain(
      'POST /api/v1/applicant-portal/requests/:requestId/documents/:documentId/replacements',
    );
    expect(routes).toContain(
      'DELETE /api/v1/applicant-portal/requests/:requestId/documents/:documentId',
    );

    for (const absentRoute of [
      'PATCH /api/v1/applicant-portal/requests/:requestId/documents/:documentId',
      'POST /api/v1/applicant-portal/uploads',
      'POST /api/v1/applicant-portal/requests/:requestId/convert-to-parent',
      'POST /api/v1/applicant-portal/conversions',
    ]) {
      expect(routes).not.toContain(absentRoute);
    }
  });

  it('uploads required and optional documents, lists/reads them safely, and updates missingItemsCount', async () => {
    const before = await getSideEffectSnapshot();

    const firstUpload = await uploadDocument(
      applicantAuth,
      applicantRequestId,
      {
        requiredDocumentId,
        filename: 'birth-certificate.pdf',
        contentType: 'application/pdf',
        body: Buffer.from('birth-certificate'),
      },
    ).expect(201);
    requiredUploadDocumentId = firstUpload.body.id;
    requiredUploadFileId = firstUpload.body.file.id;
    createdApplicantDocumentIds.push(requiredUploadDocumentId);
    createdFileIds.push(requiredUploadFileId);

    expect(firstUpload.body).toMatchObject({
      id: requiredUploadDocumentId,
      requestId: applicantRequestId,
      status: 'uploaded',
      title: 'Birth certificate',
      documentType: 'Birth certificate',
      requiredDocument: {
        id: requiredDocumentId,
        title: 'Birth certificate',
        isMandatory: true,
      },
      file: {
        originalName: 'birth-certificate.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 17,
      },
    });
    expectSafeDocumentResponse(firstUpload.body);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}`)
      .set('Authorization', bearer(applicantAuth))
      .expect(200)
      .expect(({ body }) => {
        expect(body.missingItemsCount).toBe(1);
        expect(body.progressValue).toBe(35);
        expectSafeRequestResponse(body);
      });

    const optionalUpload = await uploadDocument(
      applicantAuth,
      applicantRequestId,
      {
        title: 'Additional health note',
        documentType: 'health_note',
        notes: 'Uploaded for admissions context.',
        filename: 'health-note.txt',
        contentType: 'text/plain',
        body: Buffer.from('healthy'),
      },
    ).expect(201);
    optionalUploadDocumentId = optionalUpload.body.id;
    createdApplicantDocumentIds.push(optionalUploadDocumentId);
    createdFileIds.push(optionalUpload.body.file.id);
    expect(optionalUpload.body).toMatchObject({
      status: 'uploaded',
      title: 'Additional health note',
      documentType: 'health_note',
      requiredDocument: null,
      notes: 'Uploaded for admissions context.',
    });
    expectSafeDocumentResponse(optionalUpload.body);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.map((item: { id: string }) => item.id)).toEqual([
          requiredUploadDocumentId,
          optionalUploadDocumentId,
        ]);
        expectSafeDocumentResponse(body);
      });

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents/${requiredUploadDocumentId}`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(200)
      .expect(({ body }) => {
        expect(body.id).toBe(requiredUploadDocumentId);
        expectSafeDocumentResponse(body);
      });

    const downloadResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents/${requiredUploadDocumentId}/download`,
      )
      .set('Authorization', bearer(applicantAuth))
      .redirects(0)
      .expect(307);
    expect(downloadResponse.headers.location).toEqual(expect.any(String));
    expect(downloadResponse.headers.location).toContain('X-Amz-Expires=300');

    const signedDownloadResponse = await fetch(
      downloadResponse.headers.location,
    );
    expect(signedDownloadResponse.status).toBe(200);
    await expect(signedDownloadResponse.text()).resolves.toBe(
      'birth-certificate',
    );

    const after = await getSideEffectSnapshot();
    expect(after).toEqual({
      ...before,
      applicantDocuments: before.applicantDocuments + 2,
      files: before.files + 2,
    });
  });

  it('keeps applicant documents isolated by applicant request ownership', async () => {
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${otherApplicantRequestId}/documents`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${otherApplicantRequestId}/documents/${requiredUploadDocumentId}`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${otherApplicantRequestId}/documents/${requiredUploadDocumentId}/download`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents/${requiredUploadDocumentId}/download`,
      )
      .set('Authorization', bearer(otherApplicantAuth))
      .expect(404);

    await uploadDocument(applicantAuth, otherApplicantRequestId, {
      title: 'Cross applicant attempt',
      filename: 'cross.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('cross'),
    }).expect(404);
  });

  it('rejects non-applicant actors from applicant document routes', async () => {
    for (const auth of [
      parentAuth,
      studentAuth,
      teacherAuth,
      schoolUserAuth,
      platformAuth,
    ]) {
      await uploadDocument(auth, applicantRequestId, {
        title: 'Denied',
        filename: 'denied.pdf',
        contentType: 'application/pdf',
        body: Buffer.from('denied'),
      }).expect(403);

      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents`,
        )
        .set('Authorization', bearer(auth))
        .expect(403);

      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents/${requiredUploadDocumentId}`,
        )
        .set('Authorization', bearer(auth))
        .expect(403);

      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents/${requiredUploadDocumentId}/download`,
        )
        .set('Authorization', bearer(auth))
        .expect(403);
    }
  });

  it('rejects unsafe school or organization and invalid required document uploads', async () => {
    const schoolUnsafeRequest = (
      await createDraftRequest(applicantAuth, schoolToSuspendId, 'Farah')
    ).id;
    await prisma.school.update({
      where: { id: schoolToSuspendId },
      data: { status: SchoolStatus.SUSPENDED },
    });
    await uploadDocument(applicantAuth, schoolUnsafeRequest, {
      title: 'Denied',
      filename: 'denied.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('denied'),
    }).expect(404);

    const orgUnsafeRequest = (
      await createDraftRequest(applicantAuth, orgUnsafeSchoolId, 'Youssef')
    ).id;
    await prisma.organization.update({
      where: { id: organizationToSuspendId },
      data: { status: OrganizationStatus.SUSPENDED },
    });
    await uploadDocument(applicantAuth, orgUnsafeRequest, {
      title: 'Denied',
      filename: 'denied.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('denied'),
    }).expect(404);

    for (const rejectedRequiredDocumentId of [
      randomUUID(),
      inactiveRequiredDocumentId,
      crossSchoolRequiredDocumentId,
    ]) {
      await uploadDocument(applicantAuth, applicantRequestId, {
        requiredDocumentId: rejectedRequiredDocumentId,
        filename: 'invalid.pdf',
        contentType: 'application/pdf',
        body: Buffer.from('invalid'),
      }).expect(404);
    }

    await uploadDocument(applicantAuth, applicantRequestId, {
      requiredDocumentId,
      filename: 'wrong-type.png',
      contentType: 'image/png',
      body: Buffer.from('png'),
    }).expect(415);
  });

  it('submits successfully after all mandatory uploads and does not bridge documents in Sprint 18I', async () => {
    const secondUpload = await uploadDocument(
      applicantAuth,
      applicantRequestId,
      {
        requiredDocumentId: secondRequiredDocumentId,
        filename: 'parent-id.pdf',
        contentType: 'application/pdf',
        body: Buffer.from('parent-id'),
      },
    ).expect(201);
    createdApplicantDocumentIds.push(secondUpload.body.id);
    createdFileIds.push(secondUpload.body.file.id);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}`)
      .set('Authorization', bearer(applicantAuth))
      .expect(200)
      .expect(({ body }) => {
        expect(body.missingItemsCount).toBe(0);
        expect(body.progressValue).toBe(35);
      });

    const submitResponse = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/submit`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(200);
    expect(submitResponse.body).toMatchObject({
      id: applicantRequestId,
      status: 'submitted',
      missingItemsCount: 0,
    });

    const applicantRequest =
      await prisma.applicantAdmissionRequest.findUniqueOrThrow({
        where: { id: applicantRequestId },
      });
    createdApplicationIds.push(applicantRequest.applicationId as string);
    const application = await prisma.application.findUniqueOrThrow({
      where: { id: applicantRequest.applicationId as string },
    });
    expect(application).toMatchObject({
      schoolId: activeSchoolId,
      organizationId,
      source: AdmissionApplicationSource.IN_APP,
      status: AdmissionApplicationStatus.SUBMITTED,
    });

    const bridgedDocuments = await prisma.applicationDocument.findMany({
      where: { applicationId: applicantRequest.applicationId as string },
      orderBy: { createdAt: 'asc' },
      select: {
        fileId: true,
        documentType: true,
        status: true,
        applicantAdmissionRequestDocuments: {
          select: { id: true },
        },
      },
    });
    expect(bridgedDocuments).toEqual([
      expect.objectContaining({
        fileId: requiredUploadFileId,
        documentType: 'Birth certificate',
        status: AdmissionDocumentStatus.PENDING_REVIEW,
        applicantAdmissionRequestDocuments: [{ id: requiredUploadDocumentId }],
      }),
      expect.objectContaining({
        documentType: 'Parent ID',
        status: AdmissionDocumentStatus.PENDING_REVIEW,
      }),
    ]);
  });

  it('keeps PATCH absent while document mutations honor submitted-state policy', async () => {
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents/${requiredUploadDocumentId}/download`,
      )
      .set('Authorization', bearer(applicantAuth))
      .redirects(0)
      .expect(307);

    await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents/${requiredUploadDocumentId}`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(409);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents/${requiredUploadDocumentId}/replacements`,
      )
      .set('Authorization', bearer(applicantAuth))
      .attach('file', Buffer.from('late'), {
        filename: 'late.pdf',
        contentType: 'application/pdf',
      })
      .expect(409);

    await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents/${requiredUploadDocumentId}`,
      )
      .set('Authorization', bearer(applicantAuth))
      .send({ title: 'Replace attempt' })
      .expect(404);
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
    sortOrder?: number;
    isActive?: boolean;
    acceptedFileTypes?: string[];
  }): Promise<string> {
    const document = await prisma.admissionRequiredDocument.create({
      data: {
        schoolId: input.schoolId,
        organizationId: input.organizationId,
        title: input.title,
        isMandatory: input.isMandatory,
        isActive: input.isActive ?? true,
        acceptedFileTypes: input.acceptedFileTypes ?? [],
        maxFiles: 1,
        sortOrder: input.sortOrder ?? 0,
      },
      select: { id: true },
    });
    createdDocumentIds.push(document.id);
    return document.id;
  }

  async function createApplicantAccount(label: string): Promise<void> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/accounts`)
      .send({
        fullName: `Sprint 18I ${label} Applicant`,
        email: `${marker}-${label}@example.test`,
        password: PASSWORD,
        phoneNumber: '+20 100 000 0000',
        city: 'Cairo',
        relationship: 'guardian',
      })
      .expect(201);

    createdUserIds.push(response.body.userId);
    createdProfileIds.push(response.body.applicantId);
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
        firstName: 'Sprint18I',
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

  async function getSideEffectSnapshot(): Promise<SideEffectSnapshot> {
    const [
      memberships,
      applicationDocuments,
      applicantDocuments,
      files,
      students,
      guardians,
      studentGuardianLinks,
      enrollments,
    ] = await Promise.all([
      prisma.membership.count(),
      prisma.applicationDocument.count(),
      prisma.applicantAdmissionRequestDocument.count(),
      prisma.file.count(),
      prisma.student.count(),
      prisma.guardian.count(),
      prisma.studentGuardian.count(),
      prisma.enrollment.count(),
    ]);

    return {
      memberships,
      applicationDocuments,
      applicantDocuments,
      files,
      students,
      guardians,
      studentGuardianLinks,
      enrollments,
    };
  }

  function bearer(tokens: AuthTokens): string {
    return `Bearer ${tokens.accessToken}`;
  }

  function expectSafeDocumentResponse(body: unknown): void {
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

  function expectSafeRequestResponse(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'organizationId',
      'applicantUserId',
      'applicantProfileId',
      'applicationId',
      'applicationDocumentId',
      'deletedAt',
      'submittedAt',
      'DOCUMENTS_PENDING',
      'SUBMITTED',
      'DRAFT',
      'objectKey',
      'bucket',
      'signedUrl',
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
      select: { id: true, bucket: true, objectKey: true },
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
