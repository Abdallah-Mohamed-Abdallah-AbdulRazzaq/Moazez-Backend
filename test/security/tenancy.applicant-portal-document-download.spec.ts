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
const PASSWORD = 'Applicant18KDocsSecurity!';
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

type SideEffectSnapshot = {
  applications: number;
  applicationDocuments: number;
  students: number;
  guardians: number;
  studentGuardianLinks: number;
  enrollments: number;
  memberships: number;
};

describe('Applicant Portal document download tenancy (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageService: StorageService;

  let organizationId = '';
  let activeSchoolId = '';
  let requiredDocumentId = '';
  let roleId = '';
  let applicantRequestId = '';
  let otherApplicantRequestId = '';
  let applicantDocumentId = '';
  let uploadedFileId = '';
  let uploadResponseBody: unknown;

  let applicantAuth: AuthTokens;
  let otherApplicantAuth: AuthTokens;
  let parentAuth: AuthTokens;
  let studentAuth: AuthTokens;
  let teacherAuth: AuthTokens;
  let schoolUserAuth: AuthTokens;
  let platformAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s18k-docdlsec-${suffix}`;
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
      name: `Sprint 18K Security Org ${suffix}`,
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
          name: `Sprint 18K Security Role ${suffix}`,
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

    const uploadResponse = await uploadDocument(
      applicantAuth,
      applicantRequestId,
      {
        requiredDocumentId,
        filename: 'birth-certificate.pdf',
        contentType: 'application/pdf',
        body: Buffer.from('birth-certificate'),
      },
    ).expect(201);

    uploadResponseBody = uploadResponse.body;
    applicantDocumentId = uploadResponse.body.id;
    uploadedFileId = uploadResponse.body.file.id;
    createdApplicantDocumentIds.push(applicantDocumentId);
    createdFileIds.push(uploadedFileId);
  });

  afterAll(async () => {
    try {
      await cleanupData();
      if (app) await app.close();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('allows only the owning applicant to receive a signed redirect for an active document', async () => {
    const before = await getSideEffectSnapshot();

    expectNoInternalDocumentFields(uploadResponseBody);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(200)
      .expect(({ body }) => expectNoInternalDocumentFields(body));

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents/${applicantDocumentId}`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(200)
      .expect(({ body }) => expectNoInternalDocumentFields(body));

    const downloadResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents/${applicantDocumentId}/download`,
      )
      .set('Authorization', bearer(applicantAuth))
      .redirects(0)
      .expect(307);

    expect(downloadResponse.headers.location).toEqual(expect.any(String));
    expect(downloadResponse.headers.location).toContain('X-Amz-Expires=300');
    await expect(getSideEffectSnapshot()).resolves.toEqual(before);
  });

  it('returns not found for document id and request id guessing', async () => {
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents/${randomUUID()}/download`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${otherApplicantRequestId}/documents/${applicantDocumentId}/download`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents/${applicantDocumentId}/download`,
      )
      .set('Authorization', bearer(otherApplicantAuth))
      .expect(404);
  });

  it('denies generic Files download and non-applicant actor access', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/files/${uploadedFileId}/download`)
      .set('Authorization', bearer(applicantAuth))
      .expect(403);

    for (const auth of [
      parentAuth,
      studentAuth,
      teacherAuth,
      schoolUserAuth,
      platformAuth,
    ]) {
      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents/${applicantDocumentId}/download`,
        )
        .set('Authorization', bearer(auth))
        .expect(403);
    }
  });

  it('keeps school users out of draft applicant documents through the Applicant Portal route', async () => {
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents/${applicantDocumentId}/download`,
      )
      .set('Authorization', bearer(schoolUserAuth))
      .expect(403);
  });

  it('does not expose inactive lifecycle documents or create operational identity side effects', async () => {
    await prisma.applicantAdmissionRequestDocument.update({
      where: { id: applicantDocumentId },
      data: { status: ApplicantAdmissionRequestDocumentStatus.REJECTED },
    });

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents/${applicantDocumentId}/download`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);

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
          userId: { in: createdUserIds },
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

  async function createApplicantAccount(label: string): Promise<void> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/accounts`)
      .send({
        fullName: `Sprint 18K Security ${label} Applicant`,
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
        firstName: 'Sprint18KSecurity',
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
      applications,
      applicationDocuments,
      students,
      guardians,
      studentGuardianLinks,
      enrollments,
      memberships,
    ] = await Promise.all([
      prisma.application.count(),
      prisma.applicationDocument.count(),
      prisma.student.count(),
      prisma.guardian.count(),
      prisma.studentGuardian.count(),
      prisma.enrollment.count(),
      prisma.membership.count(),
    ]);

    return {
      applications,
      applicationDocuments,
      students,
      guardians,
      studentGuardianLinks,
      enrollments,
      memberships,
    };
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
