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
const PASSWORD = 'Applicant19AReviewSecurity!';
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

describe('Applicant Portal document review tenancy (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageService: StorageService;

  let organizationId = '';
  let schoolAId = '';
  let schoolBId = '';
  let requiredDocumentAId = '';
  let requiredDocumentBId = '';
  let manageRoleAId = '';
  let manageRoleBId = '';
  let viewOnlyRoleAId = '';
  let applicantUserId = '';
  let otherApplicantUserId = '';

  let applicantAuth: AuthTokens;
  let otherApplicantAuth: AuthTokens;
  let schoolAAuth: AuthTokens;
  let schoolBAuth: AuthTokens;
  let viewOnlyAuth: AuthTokens;
  let parentAuth: AuthTokens;
  let studentAuth: AuthTokens;
  let teacherAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s19a-review-sec-${suffix}`;
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
      name: `Sprint 19A Review Security Org ${suffix}`,
    });
    organizationId = organization.id;

    schoolAId = await createSchoolWithProfile({
      organizationId,
      slug: `${marker}-school-a`,
      name: `${marker} School A`,
      schoolName: `${marker} Public School A`,
    });
    schoolBId = await createSchoolWithProfile({
      organizationId,
      slug: `${marker}-school-b`,
      name: `${marker} School B`,
      schoolName: `${marker} Public School B`,
    });

    requiredDocumentAId = await createRequiredDocument({
      schoolId: schoolAId,
      organizationId,
      title: 'Birth certificate',
    });
    requiredDocumentBId = await createRequiredDocument({
      schoolId: schoolBId,
      organizationId,
      title: 'Birth certificate',
    });

    manageRoleAId = await createAdmissionsDocumentRole({
      schoolId: schoolAId,
      label: 'manager-a',
      manage: true,
    });
    manageRoleBId = await createAdmissionsDocumentRole({
      schoolId: schoolBId,
      label: 'manager-b',
      manage: true,
    });
    viewOnlyRoleAId = await createAdmissionsDocumentRole({
      schoolId: schoolAId,
      label: 'viewer-a',
      manage: false,
    });

    await createUserWithMembership(UserType.SCHOOL_USER, 'school-a', {
      schoolId: schoolAId,
      roleId: manageRoleAId,
    });
    await createUserWithMembership(UserType.SCHOOL_USER, 'school-b', {
      schoolId: schoolBId,
      roleId: manageRoleBId,
    });
    await createUserWithMembership(UserType.SCHOOL_USER, 'view-only', {
      schoolId: schoolAId,
      roleId: viewOnlyRoleAId,
    });
    await createUserWithMembership(UserType.PARENT, 'parent', {
      schoolId: schoolAId,
      roleId: viewOnlyRoleAId,
    });
    await createUserWithMembership(UserType.STUDENT, 'student', {
      schoolId: schoolAId,
      roleId: viewOnlyRoleAId,
    });
    await createUserWithMembership(UserType.TEACHER, 'teacher', {
      schoolId: schoolAId,
      roleId: viewOnlyRoleAId,
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
    otherApplicantUserId = await createApplicantAccount('other');

    applicantAuth = await login(`${marker}-primary@example.test`);
    otherApplicantAuth = await login(`${marker}-other@example.test`);
    schoolAAuth = await login(`${marker}-school-a@example.test`);
    schoolBAuth = await login(`${marker}-school-b@example.test`);
    viewOnlyAuth = await login(`${marker}-view-only@example.test`);
    parentAuth = await login(`${marker}-parent@example.test`);
    studentAuth = await login(`${marker}-student@example.test`);
    teacherAuth = await login(`${marker}-teacher@example.test`);
  });

  afterAll(async () => {
    try {
      await cleanupData();
      if (app) await app.close();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('school A can review its document while school B receives not found for guessed ids', async () => {
    const fixture = await createSubmittedApplicantDocument({
      auth: applicantAuth,
      schoolId: schoolAId,
      requiredDocumentId: requiredDocumentAId,
      childFirstName: 'CrossSchool',
    });

    for (const action of ['accept', 'reject', 'request-replacement'] as const) {
      await reviewDocument(schoolBAuth, action, fixture, {
        note: 'cross school attempt',
      }).expect(404);
    }

    await expectDocumentStatuses(fixture, {
      applicationDocumentStatus: AdmissionDocumentStatus.PENDING_REVIEW,
      applicantDocumentStatus: ApplicantAdmissionRequestDocumentStatus.UPLOADED,
      applicationStatus: AdmissionApplicationStatus.SUBMITTED,
    });

    await reviewDocument(schoolAAuth, 'accept', fixture, {
      note: 'same school ok',
    })
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('complete');
        expectNoSchoolDocumentLeaks(body);
      });
  });

  it('denies applicant, parent, student, teacher, and view-only actors on review routes', async () => {
    const fixture = await createSubmittedApplicantDocument({
      auth: applicantAuth,
      schoolId: schoolAId,
      requiredDocumentId: requiredDocumentAId,
      childFirstName: 'DeniedActors',
    });

    await reviewDocument(applicantAuth, 'accept', fixture, {}).expect(403);
    for (const auth of [parentAuth, studentAuth, teacherAuth, viewOnlyAuth]) {
      await reviewDocument(auth, 'reject', fixture, {
        note: 'no permission',
      }).expect(403);
    }

    await expectDocumentStatuses(fixture, {
      applicationDocumentStatus: AdmissionDocumentStatus.PENDING_REVIEW,
      applicantDocumentStatus: ApplicantAdmissionRequestDocumentStatus.UPLOADED,
      applicationStatus: AdmissionApplicationStatus.SUBMITTED,
    });
  });

  it('allows applicant replacement only after school replacement request', async () => {
    const fixture = await createSubmittedApplicantDocument({
      auth: applicantAuth,
      schoolId: schoolAId,
      requiredDocumentId: requiredDocumentAId,
      childFirstName: 'NeedsReplacement',
    });

    await replaceDocument(
      applicantAuth,
      fixture.requestId,
      fixture.applicantDocumentId,
      'early.pdf',
    ).expect(409);
    await replaceDocument(
      schoolAAuth,
      fixture.requestId,
      fixture.applicantDocumentId,
      'school-user.pdf',
    ).expect(403);

    await reviewDocument(schoolAAuth, 'request-replacement', fixture, {
      note: 'missing page',
    }).expect(200);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/requests/${fixture.requestId}`)
      .set('Authorization', bearer(applicantAuth))
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('needs_action');
        expectNoApplicantInternalFields(body);
      });

    const replacement = await replaceDocument(
      applicantAuth,
      fixture.requestId,
      fixture.applicantDocumentId,
      'replacement.pdf',
    )
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('uploaded');
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
    const replacementRecord =
      await prisma.applicantAdmissionRequestDocument.findUniqueOrThrow({
        where: { id: replacement.body.id },
        select: {
          applicationDocument: { select: { status: true } },
          applicationDocumentId: true,
        },
      });
    expect(replacementRecord.applicationDocumentId).toEqual(expect.any(String));
    expect(replacementRecord.applicationDocument?.status).toBe(
      AdmissionDocumentStatus.PENDING_REVIEW,
    );

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/files/${replacement.body.file.id}/download`)
      .set('Authorization', bearer(applicantAuth))
      .expect(403);
  });

  it('returns not found for cross-applicant replacement guessing', async () => {
    const fixture = await createSubmittedApplicantDocument({
      auth: otherApplicantAuth,
      schoolId: schoolAId,
      requiredDocumentId: requiredDocumentAId,
      childFirstName: 'OtherApplicant',
    });

    await reviewDocument(schoolAAuth, 'request-replacement', fixture, {
      note: 'other applicant needs replacement',
    }).expect(200);
    await replaceDocument(
      applicantAuth,
      fixture.requestId,
      fixture.applicantDocumentId,
      'cross-applicant.pdf',
    ).expect(404);
  });

  it('keeps review routes storage-safe and free of conversion side effects', async () => {
    const fixture = await createSubmittedApplicantDocument({
      auth: applicantAuth,
      schoolId: schoolAId,
      requiredDocumentId: requiredDocumentAId,
      childFirstName: 'StorageSafe',
    });

    await reviewDocument(schoolAAuth, 'accept', fixture, {
      note: 'storage safe',
    })
      .expect(200)
      .expect(({ body }) => expectNoSchoolDocumentLeaks(body));

    await expect(
      prisma.student.count({ where: { schoolId: schoolAId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.guardian.count({ where: { schoolId: schoolAId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.studentGuardian.count({ where: { schoolId: schoolAId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.enrollment.count({ where: { schoolId: schoolAId } }),
    ).resolves.toBe(0);
    await expect(
      prisma.membership.count({
        where: { userId: applicantUserId, userType: UserType.APPLICANT },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.membership.count({
        where: { userId: otherApplicantUserId, userType: UserType.APPLICANT },
      }),
    ).resolves.toBe(0);
  });

  async function createSubmittedApplicantDocument(input: {
    auth: AuthTokens;
    schoolId: string;
    requiredDocumentId: string;
    childFirstName: string;
  }): Promise<{
    requestId: string;
    applicantDocumentId: string;
    applicationId: string;
    applicationDocumentId: string;
    fileId: string;
  }> {
    const requestId = (
      await createDraftRequest(input.auth, input.schoolId, input.childFirstName)
    ).id;
    const upload = await uploadDocument(input.auth, requestId, {
      requiredDocumentId: input.requiredDocumentId,
      filename: `${input.childFirstName.toLowerCase()}.pdf`,
      body: Buffer.from(`${input.childFirstName.toLowerCase()}-document`),
    }).expect(201);
    rememberDocumentAndFile(upload.body);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/submit`)
      .set('Authorization', bearer(input.auth))
      .expect(200)
      .expect(({ body }) => expectNoApplicantInternalFields(body));

    const requestRecord =
      await prisma.applicantAdmissionRequest.findUniqueOrThrow({
        where: { id: requestId },
        select: { applicationId: true },
      });
    expect(requestRecord.applicationId).toEqual(expect.any(String));
    const applicationId = requestRecord.applicationId as string;
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
    auth: AuthTokens,
    action: 'accept' | 'reject' | 'request-replacement',
    fixture: { applicationId: string; applicationDocumentId: string },
    body: { note?: string },
  ) {
    return request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/admissions/applications/${fixture.applicationId}/documents/${fixture.applicationDocumentId}/${action}`,
      )
      .set('Authorization', bearer(auth))
      .send(body);
  }

  function replaceDocument(
    auth: AuthTokens,
    requestId: string,
    documentId: string,
    filename: string,
  ) {
    return request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents/${documentId}/replacements`,
      )
      .set('Authorization', bearer(auth))
      .attach('file', Buffer.from(`${filename}-body`), {
        filename,
        contentType: 'application/pdf',
      });
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
  }): Promise<string> {
    const document = await prisma.admissionRequiredDocument.create({
      data: {
        schoolId: input.schoolId,
        organizationId: input.organizationId,
        title: input.title,
        isMandatory: true,
        acceptedFileTypes: ['application/pdf'],
        maxFiles: 1,
      },
      select: { id: true },
    });
    createdDocumentIds.push(document.id);
    return document.id;
  }

  async function createAdmissionsDocumentRole(input: {
    schoolId: string;
    label: string;
    manage: boolean;
  }): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId: input.schoolId,
        key: `${marker}-${input.label}`,
        name: `Sprint 19A ${input.label}`,
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);

    const permissionCodes = input.manage
      ? ['admissions.documents.view', 'admissions.documents.manage']
      : ['admissions.documents.view'];
    for (const permissionCode of permissionCodes) {
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
    membership: { schoolId: string; roleId: string },
  ): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `${marker}-${label}@example.test`,
        firstName: 'Sprint19ASecurity',
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
        fullName: `Sprint 19A Security ${label} Applicant`,
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
      requiredDocumentId: string;
      filename: string;
      body: Buffer;
    },
  ) {
    return request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents`)
      .set('Authorization', bearer(auth))
      .field('requiredDocumentId', input.requiredDocumentId)
      .attach('file', input.body, {
        filename: input.filename,
        contentType: 'application/pdf',
      });
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
