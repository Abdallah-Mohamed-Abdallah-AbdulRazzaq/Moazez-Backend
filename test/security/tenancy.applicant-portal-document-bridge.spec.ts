import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
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
const PASSWORD = 'Applicant18MBridgeSecurity!';
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

describe('Applicant Portal document bridge tenancy (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let storageService: StorageService;

  let organizationId = '';
  let activeSchoolId = '';
  let otherSchoolId = '';
  let requiredDocumentId = '';
  let activeRoleId = '';
  let otherRoleId = '';
  let applicantUserId = '';

  let applicantAuth: AuthTokens;
  let schoolUserAuth: AuthTokens;
  let otherSchoolUserAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s18m-bridgesec-${suffix}`;
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

    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org`,
        name: `Sprint 18M Bridge Security Org ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationId = organization.id;
    createdOrganizationIds.push(organization.id);

    activeSchoolId = await createSchoolWithProfile('a');
    otherSchoolId = await createSchoolWithProfile('b');
    requiredDocumentId = await createRequiredDocument();
    activeRoleId = await createAdmissionsViewerRole(activeSchoolId, 'a');
    otherRoleId = await createAdmissionsViewerRole(otherSchoolId, 'b');

    await createUserWithMembership('school-user', activeSchoolId, activeRoleId);
    await createUserWithMembership(
      'other-school-user',
      otherSchoolId,
      otherRoleId,
    );

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

    applicantUserId = await createApplicantAccount();
    applicantAuth = await login(`${marker}-applicant@example.test`);
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

  it('exposes submitted bridged documents only to the selected school', async () => {
    const requestId = await createDraftRequest('Secure Bridge');
    const upload = await uploadDocument(requestId).expect(201);
    rememberDocumentAndFile(upload.body);
    expectNoApplicantLeaks(upload.body);

    await expect(
      prisma.applicationDocument.count({
        where: {
          applicantAdmissionRequestDocuments: {
            some: { requestId },
          },
        },
      }),
    ).resolves.toBe(0);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/submit`)
      .set('Authorization', bearer(applicantAuth))
      .expect(200)
      .expect(({ body }) => expectNoApplicantLeaks(body));

    const applicationId = await getApplicationIdForRequest(requestId);
    createdApplicationIds.push(applicationId);
    const bridgedDocument = await prisma.applicationDocument.findFirstOrThrow({
      where: { applicationId },
      select: {
        id: true,
        fileId: true,
        schoolId: true,
        status: true,
      },
    });
    expect(bridgedDocument).toMatchObject({
      fileId: upload.body.file.id,
      schoolId: activeSchoolId,
      status: AdmissionDocumentStatus.PENDING_REVIEW,
    });

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/admissions/applications/${applicationId}/documents`,
      )
      .set('Authorization', bearer(schoolUserAuth))
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({
          id: bridgedDocument.id,
          fileId: upload.body.file.id,
          status: 'pending_review',
        });
        expectNoSchoolLeaks(body);
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
      .get(`${GLOBAL_PREFIX}/files/${upload.body.file.id}/download`)
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

  it('does not create conversion, enrollment, or applicant membership side effects', async () => {
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

  async function createSchoolWithProfile(label: string): Promise<string> {
    const school = await prisma.school.create({
      data: {
        organizationId,
        slug: `${marker}-school-${label}`,
        name: `${marker} School ${label}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    const profile = await prisma.schoolProfile.create({
      data: {
        schoolId: school.id,
        schoolName: `${marker} School ${label} Public`,
        city: 'Cairo',
        country: 'Egypt',
      },
      select: { id: true },
    });
    createdSchoolProfileIds.push(profile.id);
    return school.id;
  }

  async function createRequiredDocument(): Promise<string> {
    const document = await prisma.admissionRequiredDocument.create({
      data: {
        schoolId: activeSchoolId,
        organizationId,
        title: 'Birth certificate',
        isMandatory: true,
        acceptedFileTypes: ['application/pdf'],
        maxFiles: 1,
        sortOrder: 10,
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
        key: `${marker}-role-${label}`,
        name: `Sprint 18M Bridge Security ${label}`,
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
    label: string,
    schoolId: string,
    roleId: string,
  ): Promise<void> {
    const user = await prisma.user.create({
      data: {
        email: `${marker}-${label}@example.test`,
        firstName: 'Sprint18M',
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

  async function createApplicantAccount(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/accounts`)
      .send({
        fullName: 'Sprint 18M Security Applicant',
        email: `${marker}-applicant@example.test`,
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

  async function createDraftRequest(childFirstName: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests`)
      .set('Authorization', bearer(applicantAuth))
      .send({ schoolId: activeSchoolId, childFirstName })
      .expect(201);

    createdRequestIds.push(response.body.id);
    return response.body.id;
  }

  function uploadDocument(requestId: string) {
    return request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests/${requestId}/documents`)
      .set('Authorization', bearer(applicantAuth))
      .field('requiredDocumentId', requiredDocumentId)
      .attach('file', Buffer.from('secure-birth'), {
        filename: 'secure-birth.pdf',
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

  function expectNoApplicantLeaks(body: unknown): void {
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
      'deletedAt',
      'PENDING_REVIEW',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }

  function expectNoSchoolLeaks(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'applicantUserId',
      'applicantProfileId',
      'bucket',
      'objectKey',
      'signedUrl',
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
