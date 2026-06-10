import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AdmissionApplicationStatus,
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
const PASSWORD = 'Applicant18GSecurity!';
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

describe('Applicant Portal request submission tenancy (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let organizationToSuspendId = '';
  let activeSchoolId = '';
  let schoolToSuspendId = '';
  let orgUnsafeSchoolId = '';
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
  const marker = `s18g-security-${suffix}`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdSchoolProfileIds: string[] = [];
  const createdDocumentIds: string[] = [];
  const createdRequestIds: string[] = [];
  const createdApplicationIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdProfileIds: string[] = [];
  const createdRoleIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const activeOrganization = await createOrganization({
      slug: `${marker}-active-org`,
      name: `Sprint 18G Security Active Org ${suffix}`,
      status: OrganizationStatus.ACTIVE,
    });
    organizationId = activeOrganization.id;
    const organizationToSuspend = await createOrganization({
      slug: `${marker}-org-to-suspend`,
      name: `Sprint 18G Security Org To Suspend ${suffix}`,
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
          name: `Sprint 18G Security Role ${suffix}`,
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

  it('lets an applicant submit only their own request and leaks no internals', async () => {
    applicantRequestId = (
      await createDraftRequest(applicantAuth, activeSchoolId, 'Layla')
    ).id;
    otherApplicantRequestId = (
      await createDraftRequest(otherApplicantAuth, activeSchoolId, 'Omar')
    ).id;

    const before = await getSideEffectSnapshot();

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/submit`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(200);

    expect(response.body).toMatchObject({
      id: applicantRequestId,
      status: 'needs_action',
      missingItemsCount: 2,
      progressValue: 40,
    });
    expectNoInternalTenantFields(response.body);

    const requestDb = await prisma.applicantAdmissionRequest.findUniqueOrThrow({
      where: { id: applicantRequestId },
    });
    createdApplicationIds.push(requestDb.applicationId as string);
    const application = await prisma.application.findUniqueOrThrow({
      where: { id: requestDb.applicationId as string },
    });
    expect(application.status).toBe(
      AdmissionApplicationStatus.DOCUMENTS_PENDING,
    );
    expect(application.schoolId).toBe(activeSchoolId);
    expect(application.organizationId).toBe(organizationId);

    const after = await getSideEffectSnapshot();
    expect(after).toEqual({ ...before, applications: before.applications + 1 });

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${otherApplicantRequestId}/submit`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);
  });

  it('rejects submit to unsafe schools and organizations', async () => {
    const schoolUnsafeDraft = await createDraftRequest(
      applicantAuth,
      schoolToSuspendId,
      'Farah',
    );
    await prisma.school.update({
      where: { id: schoolToSuspendId },
      data: { status: SchoolStatus.SUSPENDED },
    });
    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${schoolUnsafeDraft.id}/submit`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);

    const orgUnsafeDraft = await createDraftRequest(
      applicantAuth,
      orgUnsafeSchoolId,
      'Youssef',
    );
    await prisma.organization.update({
      where: { id: organizationToSuspendId },
      data: { deletedAt: new Date() },
    });
    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/applicant-portal/requests/${orgUnsafeDraft.id}/submit`,
      )
      .set('Authorization', bearer(applicantAuth))
      .expect(404);
  });

  it('rejects non-applicant actors and school users from submit', async () => {
    const draft = await createDraftRequest(applicantAuth, activeSchoolId, 'Nour');

    for (const auth of [
      parentAuth,
      studentAuth,
      teacherAuth,
      schoolUserAuth,
      platformAuth,
    ]) {
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/applicant-portal/requests/${draft.id}/submit`)
        .set('Authorization', bearer(auth))
        .expect(403);
    }
  });

  it('keeps applicant denial from other protected surfaces unchanged', async () => {
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

  it('keeps document/upload/conversion applicant routes absent', async () => {
    for (const route of [
      `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/documents`,
      `${GLOBAL_PREFIX}/applicant-portal/uploads`,
      `${GLOBAL_PREFIX}/applicant-portal/requests/${applicantRequestId}/convert-to-parent`,
      `${GLOBAL_PREFIX}/applicant-portal/conversions`,
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
        fullName: `Sprint 18G Security ${label} Applicant`,
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
        firstName: 'Sprint18G',
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
      'applicationId',
      'deletedAt',
      'submittedAt',
      'DOCUMENTS_PENDING',
      'SUBMITTED',
      'DRAFT',
      'objectKey',
      'bucket',
      'signedUrl',
      'featureControl',
      'featureControls',
      'entitlement',
      'billing',
      'subscription',
      'plan',
      'quota',
      'staff',
      'studentCount',
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
          {
            resourceId: {
              in: [
                ...createdProfileIds,
                ...createdRequestIds,
                ...createdApplicationIds,
              ],
            },
          },
          { schoolId: { in: createdSchoolIds } },
          { organizationId: { in: createdOrganizationIds } },
        ],
      },
    });
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
