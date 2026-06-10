import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
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
const PASSWORD = 'Applicant18FSecurity!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(45000);

type AuthTokens = {
  accessToken: string;
};

type SideEffectSnapshot = {
  memberships: number;
  applications: number;
  applicationDocuments: number;
  files: number;
  students: number;
  guardians: number;
  studentGuardianLinks: number;
  enrollments: number;
};

describe('Applicant Portal request ownership tenancy (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let activeSchoolId = '';
  let suspendedSchoolId = '';
  let deletedSchoolId = '';
  let suspendedOrganizationSchoolId = '';
  let deletedOrganizationSchoolId = '';
  let roleId = '';
  let applicantRequestId = '';
  let otherApplicantRequestId = '';

  let applicantAuth: AuthTokens;
  let otherApplicantAuth: AuthTokens;
  let parentAuth: AuthTokens;
  let studentAuth: AuthTokens;
  let teacherAuth: AuthTokens;
  let schoolUserAuth: AuthTokens;
  let platformAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s18f-security-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdSchoolProfileIds: string[] = [];
  const createdDocumentIds: string[] = [];
  const createdRequestIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdProfileIds: string[] = [];
  const createdRoleIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const activeOrganization = await createOrganization({
      slug: `${marker}-active-org`,
      name: `Sprint 18F Security Active Org ${suffix}`,
      status: OrganizationStatus.ACTIVE,
    });
    organizationId = activeOrganization.id;
    const suspendedOrganization = await createOrganization({
      slug: `${marker}-suspended-org`,
      name: `Sprint 18F Security Suspended Org ${suffix}`,
      status: OrganizationStatus.SUSPENDED,
    });
    const deletedOrganization = await createOrganization({
      slug: `${marker}-deleted-org`,
      name: `Sprint 18F Security Deleted Org ${suffix}`,
      status: OrganizationStatus.ACTIVE,
      deletedAt: new Date(),
    });

    activeSchoolId = await createSchoolWithProfile({
      organizationId,
      slug: `${marker}-active`,
      name: `${marker} Active Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Active Public`,
    });
    suspendedSchoolId = await createSchoolWithProfile({
      organizationId,
      slug: `${marker}-suspended`,
      name: `${marker} Suspended Academy`,
      status: SchoolStatus.SUSPENDED,
      schoolName: `${marker} Suspended Public`,
    });
    deletedSchoolId = await createSchoolWithProfile({
      organizationId,
      slug: `${marker}-deleted`,
      name: `${marker} Deleted Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Deleted Public`,
      deletedAt: new Date(),
    });
    suspendedOrganizationSchoolId = await createSchoolWithProfile({
      organizationId: suspendedOrganization.id,
      slug: `${marker}-suspended-org-school`,
      name: `${marker} Suspended Org Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Suspended Org Public`,
    });
    deletedOrganizationSchoolId = await createSchoolWithProfile({
      organizationId: deletedOrganization.id,
      slug: `${marker}-deleted-org-school`,
      name: `${marker} Deleted Org Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Deleted Org Public`,
    });

    await createRequiredDocument('Birth certificate', true);
    await createRequiredDocument('Parent ID', true);
    await createRequiredDocument(`${marker} Optional`, false);
    await createRequiredDocument(`${marker} Inactive`, true, false);
    await createRequiredDocument(`${marker} Deleted`, true, true, new Date());

    roleId = (
      await prisma.role.create({
        data: {
          schoolId: activeSchoolId,
          key: `${marker}-role`,
          name: `Sprint 18F Security Role ${suffix}`,
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

    await createApplicantAccount('primary');
    await createApplicantAccount('other');

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
      if (app) await app.close();
      await cleanupData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('lets applicants access only their own draft requests and leaks no tenant fields', async () => {
    const before = await getSideEffectSnapshot();

    const createResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests`)
      .set('Authorization', bearer(applicantAuth))
      .send({
        schoolId: activeSchoolId,
        childFirstName: 'Layla',
        childLastName: 'Hassan',
      })
      .expect(201);
    applicantRequestId = createResponse.body.id;
    createdRequestIds.push(applicantRequestId);

    expect(createResponse.body).toMatchObject({
      id: applicantRequestId,
      status: 'draft',
      school: {
        id: activeSchoolId,
        name: `${marker} Active Public`,
      },
      childFullName: 'Layla Hassan',
      missingItemsCount: 2,
      progressValue: 25,
    });
    expectNoInternalTenantFields(createResponse.body);

    const after = await getSideEffectSnapshot();
    expect(after).toEqual(before);

    const otherCreateResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/requests`)
      .set('Authorization', bearer(otherApplicantAuth))
      .send({
        schoolId: activeSchoolId,
        childFirstName: 'Omar',
      })
      .expect(201);
    otherApplicantRequestId = otherCreateResponse.body.id;
    createdRequestIds.push(otherApplicantRequestId);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}`)
      .set('Authorization', bearer(applicantAuth))
      .expect(200);
    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${otherApplicantRequestId}`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);

    const listResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/requests`)
      .set('Authorization', bearer(applicantAuth))
      .expect(200);

    expect(JSON.stringify(listResponse.body)).toContain(applicantRequestId);
    expect(JSON.stringify(listResponse.body)).not.toContain(
      otherApplicantRequestId,
    );
    expectNoInternalTenantFields(listResponse.body);
  });

  it('rejects unsafe school targets without creating a request', async () => {
    const beforeCount = await prisma.applicantAdmissionRequest.count();

    for (const schoolId of [
      suspendedSchoolId,
      deletedSchoolId,
      suspendedOrganizationSchoolId,
      deletedOrganizationSchoolId,
      randomUUID(),
    ]) {
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/applicant-portal/requests`)
        .set('Authorization', bearer(applicantAuth))
        .send({ schoolId, childFirstName: 'Mona' })
        .expect(404);
    }

    await expect(prisma.applicantAdmissionRequest.count()).resolves.toBe(
      beforeCount,
    );
  });

  it('rejects parent, student, teacher, school, and platform users from applicant request routes', async () => {
    for (const auth of [
      parentAuth,
      studentAuth,
      teacherAuth,
      schoolUserAuth,
      platformAuth,
    ]) {
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/applicant-portal/requests`)
        .set('Authorization', bearer(auth))
        .send({ schoolId: activeSchoolId, childFirstName: 'Mona' })
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/applicant-portal/requests`)
        .set('Authorization', bearer(auth))
        .expect(403);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}`)
        .set('Authorization', bearer(auth))
        .expect(403);
    }
  });

  it('keeps applicant and school-user tokens out of unrelated protected surfaces', async () => {
    for (const route of [
      `${GLOBAL_PREFIX}/parent/home`,
      `${GLOBAL_PREFIX}/student/home`,
      `${GLOBAL_PREFIX}/teacher/home`,
      `${GLOBAL_PREFIX}/admissions/applications`,
      `${GLOBAL_PREFIX}/platform-admin/overview`,
    ]) {
      const response = await request(app.getHttpServer())
        .get(route)
        .set('Authorization', bearer(applicantAuth))
        .expect(403);

      expect(response.body?.error?.code).toBe('auth.scope.missing');
    }

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/admissions/applications`)
      .set('Authorization', bearer(schoolUserAuth))
      .expect(403);
  });

  it('keeps submit, document, and upload applicant routes absent', async () => {
    for (const route of [
      `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/submit`,
      `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents`,
      `${GLOBAL_PREFIX}/applicant-portal/uploads`,
    ]) {
      await request(app.getHttpServer())
        .post(route)
        .set('Authorization', bearer(applicantAuth))
        .expect(404);
    }

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);
  });

  async function createOrganization(input: {
    slug: string;
    name: string;
    status: OrganizationStatus;
    deletedAt?: Date | null;
  }): Promise<{ id: string }> {
    const organization = await prisma.organization.create({
      data: {
        slug: input.slug,
        name: input.name,
        status: input.status,
        deletedAt: input.deletedAt ?? null,
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
    deletedAt?: Date | null;
  }): Promise<string> {
    const school = await prisma.school.create({
      data: {
        organizationId: input.organizationId,
        slug: input.slug,
        name: input.name,
        status: input.status,
        deletedAt: input.deletedAt ?? null,
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

  async function createRequiredDocument(
    title: string,
    isMandatory: boolean,
    isActive = true,
    deletedAt: Date | null = null,
  ): Promise<void> {
    const document = await prisma.admissionRequiredDocument.create({
      data: {
        schoolId: activeSchoolId,
        organizationId,
        title,
        isMandatory,
        isActive,
        deletedAt,
        acceptedFileTypes: ['application/pdf'],
        maxFiles: 1,
      },
      select: { id: true },
    });
    createdDocumentIds.push(document.id);
  }

  async function createApplicantAccount(label: string): Promise<void> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/accounts`)
      .send({
        fullName: `Sprint 18F Security ${label} Applicant`,
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
        firstName: 'Sprint18F',
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
      applications,
      applicationDocuments,
      files,
      students,
      guardians,
      studentGuardianLinks,
      enrollments,
    ] = await Promise.all([
      prisma.membership.count(),
      prisma.application.count(),
      prisma.applicationDocument.count(),
      prisma.file.count(),
      prisma.student.count(),
      prisma.guardian.count(),
      prisma.studentGuardian.count(),
      prisma.enrollment.count(),
    ]);

    return {
      memberships,
      applications,
      applicationDocuments,
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

  function expectNoInternalTenantFields(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'organizationId',
      'applicantUserId',
      'applicantProfileId',
      'deletedAt',
      'submittedAt',
      'applicationId',
      'DRAFT',
      'SUBMITTED',
      'featureControl',
      'featureControls',
      'entitlement',
      'billing',
      'subscription',
      'plan',
      'quota',
      'staff',
      'studentCount',
      'objectKey',
      'bucket',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  }

  async function cleanupData(): Promise<void> {
    if (!prisma) return;

    await prisma.session.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: createdUserIds } },
          { resourceId: { in: [...createdProfileIds, ...createdRequestIds] } },
          { schoolId: { in: createdSchoolIds } },
          { organizationId: { in: createdOrganizationIds } },
        ],
      },
    });
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
