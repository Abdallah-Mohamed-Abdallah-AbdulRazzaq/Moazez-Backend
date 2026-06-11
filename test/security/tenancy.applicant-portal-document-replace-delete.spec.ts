import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
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
const PASSWORD = 'Applicant18LDocsSecurity!';
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

describe('Applicant Portal document replace/delete tenancy (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageService: StorageService;

  let organizationId = '';
  let activeSchoolId = '';
  let requiredDocumentId = '';
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
  const marker = `s18l-docmutsec-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdSchoolProfileIds: string[] = [];
  const createdDocumentIds: string[] = [];
  const createdRequestIds: string[] = [];
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
      name: `Sprint 18L Security Org ${suffix}`,
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
    });

    roleId = (
      await prisma.role.create({
        data: {
          schoolId: activeSchoolId,
          key: `${marker}-role`,
          name: `Sprint 18L Security Role ${suffix}`,
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

  it('allows an applicant to replace and delete only their own active documents with safe responses', async () => {
    const requestId = (
      await createDraftRequest(applicantAuth, activeSchoolId, 'Layla')
    ).id;
    const upload = await uploadDocument(applicantAuth, requestId, {
      requiredDocumentId,
      filename: 'birth.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('birth'),
    }).expect(201);
    rememberDocumentAndFile(upload.body);
    expectNoInternalDocumentFields(upload.body);

    const replacement = await replaceDocument(
      applicantAuth,
      requestId,
      upload.body.id,
      {
        filename: 'replacement.pdf',
        contentType: 'application/pdf',
        body: Buffer.from('replacement'),
      },
    ).expect(201);
    rememberDocumentAndFile(replacement.body);
    expectNoInternalDocumentFields(replacement.body);

    await expect(
      prisma.applicantAdmissionRequestDocument.findUnique({
        where: { id: upload.body.id },
        select: { status: true },
      }),
    ).resolves.toEqual({
      status: ApplicantAdmissionRequestDocumentStatus.SUPERSEDED,
    });

    await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents/${replacement.body.id}`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ ok: true }));

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents`)
      .set('Authorization', bearer(applicantAuth))
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.map((item: { id: string }) => item.id)).not.toContain(
          upload.body.id,
        );
        expect(body.data.map((item: { id: string }) => item.id)).not.toContain(
          replacement.body.id,
        );
        expectNoInternalDocumentFields(body);
      });
  });

  it('returns not found for request id guessing, document id guessing, and cross-applicant mutation attempts', async () => {
    const requestId = (
      await createDraftRequest(applicantAuth, activeSchoolId, 'Nour')
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

    await replaceDocument(applicantAuth, randomUUID(), upload.body.id, {
      filename: 'guess.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('guess'),
    }).expect(404);
    await replaceDocument(applicantAuth, requestId, randomUUID(), {
      filename: 'guess.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('guess'),
    }).expect(404);
    await replaceDocument(applicantAuth, otherRequestId, otherUpload.body.id, {
      filename: 'cross.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('cross'),
    }).expect(404);
    await replaceDocument(otherApplicantAuth, requestId, upload.body.id, {
      filename: 'cross.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('cross'),
    }).expect(404);

    await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${randomUUID()}/documents/${upload.body.id}`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);
    await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents/${randomUUID()}`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);
    await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${otherRequestId}/documents/${otherUpload.body.id}`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);
    await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents/${upload.body.id}`,
      )
      .set('Authorization', bearer(otherApplicantAuth))
      .expect(404);
  });

  it('keeps superseded and deleted documents unavailable for download', async () => {
    const requestId = (
      await createDraftRequest(applicantAuth, activeSchoolId, 'Farah')
    ).id;
    const upload = await uploadDocument(applicantAuth, requestId, {
      requiredDocumentId,
      filename: 'old.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('old'),
    }).expect(201);
    rememberDocumentAndFile(upload.body);

    const replacement = await replaceDocument(
      applicantAuth,
      requestId,
      upload.body.id,
      {
        filename: 'new.pdf',
        contentType: 'application/pdf',
        body: Buffer.from('new'),
      },
    ).expect(201);
    rememberDocumentAndFile(replacement.body);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents/${upload.body.id}/download`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);

    await request(app.getHttpServer())
      .delete(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents/${replacement.body.id}`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(200);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents/${replacement.body.id}/download`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);
  });

  it('denies parent, student, teacher, school, and platform users from replace/delete routes', async () => {
    const requestId = (
      await createDraftRequest(applicantAuth, activeSchoolId, 'Youssef')
    ).id;
    const upload = await uploadDocument(applicantAuth, requestId, {
      requiredDocumentId,
      filename: 'denied-target.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('target'),
    }).expect(201);
    rememberDocumentAndFile(upload.body);

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

  it('keeps generic Files routes unavailable and creates no bridge or operational identity side effects', async () => {
    const requestId = (
      await createDraftRequest(applicantAuth, activeSchoolId, 'Mariam')
    ).id;
    const upload = await uploadDocument(applicantAuth, requestId, {
      requiredDocumentId,
      filename: 'generic-denied.pdf',
      contentType: 'application/pdf',
      body: Buffer.from('generic-denied'),
    }).expect(201);
    rememberDocumentAndFile(upload.body);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/files`)
      .set('Authorization', bearer(applicantAuth))
      .attach('file', Buffer.from('generic'), {
        filename: 'generic.pdf',
        contentType: 'application/pdf',
      })
      .expect(403);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/files/${upload.body.file.id}/download`)
      .set('Authorization', bearer(applicantAuth))
      .expect(403);

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
  }): Promise<string> {
    const document = await prisma.admissionRequiredDocument.create({
      data: {
        schoolId: input.schoolId,
        organizationId: input.organizationId,
        title: input.title,
        isMandatory: input.isMandatory,
        acceptedFileTypes: ['application/pdf'],
        maxFiles: 1,
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
        fullName: `Sprint 18L Security ${label} Applicant`,
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

    return call;
  }

  function replaceDocument(
    auth: AuthTokens,
    requestId: string,
    documentId: string,
    input: {
      filename: string;
      contentType: string;
      body: Buffer;
    },
  ) {
    return request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents/${documentId}/replacements`,
      )
      .set('Authorization', bearer(auth))
      .attach('file', input.body, {
        filename: input.filename,
        contentType: input.contentType,
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
        firstName: 'Sprint18LSecurity',
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
