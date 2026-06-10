import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolEntitlementStatus,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'Applicant18CSecurity!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type AuthTokens = {
  accessToken: string;
};

describe('Applicant Portal school discovery tenancy (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let activeSchoolId = '';
  let suspendedSchoolId = '';
  let archivedSchoolId = '';
  let deletedSchoolId = '';
  let schoolUserId = '';
  let roleId = '';
  let entitlementId = '';
  let featureControlId = '';
  let applicantAuth: AuthTokens;
  let schoolUserAuth: AuthTokens;
  let platformAuth: AuthTokens;

  const suffix = randomUUID().split('-')[0];
  const marker = `s18c-security-${suffix}`;
  const staffEmail = `${marker}-staff@example.test`;
  const featureKey = `${marker.replace(/-/g, '_')}_applicant_portal`;
  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdProfileIds: string[] = [];
  const createdRoleIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org`,
        name: `Sprint 18C Security Org ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationId = organization.id;
    createdOrganizationIds.push(organization.id);

    activeSchoolId = await createSchoolWithProfile({
      slug: `${marker}-active`,
      name: `${marker} Active Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Active Public`,
      city: 'Cairo',
      logoUrl: `https://assets.example.test/${marker}/active-logo.png`,
    });
    suspendedSchoolId = await createSchoolWithProfile({
      slug: `${marker}-suspended`,
      name: `${marker} Suspended Academy`,
      status: SchoolStatus.SUSPENDED,
      schoolName: `${marker} Suspended Public`,
      city: 'Cairo',
    });
    archivedSchoolId = await createSchoolWithProfile({
      slug: `${marker}-archived`,
      name: `${marker} Archived Academy`,
      status: SchoolStatus.ARCHIVED,
      schoolName: `${marker} Archived Public`,
      city: 'Cairo',
    });
    deletedSchoolId = await createSchoolWithProfile({
      slug: `${marker}-deleted`,
      name: `${marker} Deleted Academy`,
      status: SchoolStatus.ACTIVE,
      schoolName: `${marker} Deleted Public`,
      city: 'Cairo',
      deletedAt: new Date(),
    });

    const role = await prisma.role.create({
      data: {
        schoolId: activeSchoolId,
        key: `${marker}-staff-role`,
        name: `Sprint 18C Staff ${suffix}`,
        isSystem: false,
      },
      select: { id: true },
    });
    roleId = role.id;
    createdRoleIds.push(role.id);

    schoolUserId = await createUser({
      email: staffEmail,
      userType: UserType.SCHOOL_USER,
      firstName: 'School',
      lastName: 'User',
    });
    await prisma.membership.create({
      data: {
        userId: schoolUserId,
        organizationId,
        schoolId: activeSchoolId,
        roleId,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
      },
    });

    const entitlement = await prisma.schoolEntitlement.create({
      data: {
        schoolId: activeSchoolId,
        organizationId,
        status: SchoolEntitlementStatus.ACTIVE,
        studentSeatLimit: 123,
        notes: `${marker}-internal-entitlement-note`,
      },
      select: { id: true },
    });
    entitlementId = entitlement.id;

    const featureControl = await prisma.schoolFeatureControl.create({
      data: {
        schoolId: activeSchoolId,
        organizationId,
        featureKey,
        enabled: true,
        notes: `${marker}-internal-feature-note`,
      },
      select: { id: true },
    });
    featureControlId = featureControl.id;

    await createUser({
      email: `${marker}-platform@example.test`,
      userType: UserType.PLATFORM_USER,
      firstName: 'Platform',
      lastName: 'User',
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

    const applicant = await createApplicantAccount();
    applicantAuth = await login(`${marker}-applicant@example.test`);
    schoolUserAuth = await login(staffEmail);
    platformAuth = await login(`${marker}-platform@example.test`);
    expect(applicant.userId).toBeDefined();
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await cleanupData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('leaks no internal tenant fields or operational records in public discovery', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/schools`)
      .query({ search: marker, limit: 100 })
      .expect(200);

    expect(response.body.data).toEqual([
      {
        id: activeSchoolId,
        name: `${marker} Active Public`,
        shortName: null,
        city: 'Cairo',
        country: null,
        address: null,
        logoUrl: `https://assets.example.test/${marker}/active-logo.png`,
      },
    ]);
    expectNoForbiddenPublicFields(response.body);
  });

  it('returns identical public data for anonymous, applicant, school-user, and platform tokens', async () => {
    const anonymousList = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/schools`)
      .query({ search: marker, limit: 100 })
      .expect(200);
    const anonymousDetail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/schools/${activeSchoolId}`)
      .expect(200);

    for (const auth of [applicantAuth, schoolUserAuth, platformAuth]) {
      const listResponse = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/applicant-portal/schools`)
        .query({ search: marker, limit: 100 })
        .set('Authorization', bearer(auth))
        .expect(200);
      const detailResponse = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/applicant-portal/schools/${activeSchoolId}`)
        .set('Authorization', bearer(auth))
        .expect(200);

      expect(listResponse.body).toEqual(anonymousList.body);
      expect(detailResponse.body).toEqual(anonymousDetail.body);
      expectNoForbiddenPublicFields(listResponse.body);
      expectNoForbiddenPublicFields(detailResponse.body);
    }
  });

  it('does not list suspended, archived, deleted, or nonexistent schools', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/schools`)
      .query({ search: marker, limit: 100 })
      .expect(200);
    const serialized = JSON.stringify(response.body);

    expect(serialized).toContain(activeSchoolId);
    expect(serialized).not.toContain(suspendedSchoolId);
    expect(serialized).not.toContain(archivedSchoolId);
    expect(serialized).not.toContain(deletedSchoolId);

    for (const schoolId of [
      suspendedSchoolId,
      archivedSchoolId,
      deletedSchoolId,
      randomUUID(),
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/applicant-portal/schools/${schoolId}`)
        .expect(404);
    }
  });

  it('does not expose school-scoped operational data through public discovery', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/schools/${activeSchoolId}`)
      .set('Authorization', bearer(schoolUserAuth))
      .expect(200);

    const serialized = JSON.stringify(response.body);
    for (const internalValue of [
      organizationId,
      roleId,
      schoolUserId,
      staffEmail,
      entitlementId,
      featureControlId,
      featureKey,
      `${marker}-internal-entitlement-note`,
      `${marker}-internal-feature-note`,
      'studentSeatLimit',
    ]) {
      expect(serialized).not.toContain(internalValue);
    }
  });

  it('still rejects applicant tokens from non-applicant application surfaces', async () => {
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
  });

  async function createSchoolWithProfile(input: {
    slug: string;
    name: string;
    status: SchoolStatus;
    schoolName: string;
    city: string;
    logoUrl?: string | null;
    deletedAt?: Date | null;
  }): Promise<string> {
    const school = await prisma.school.create({
      data: {
        organizationId,
        slug: input.slug,
        name: input.name,
        status: input.status,
        deletedAt: input.deletedAt ?? null,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    await prisma.schoolProfile.create({
      data: {
        schoolId: school.id,
        schoolName: input.schoolName,
        city: input.city,
        logoUrl: input.logoUrl ?? null,
      },
    });

    return school.id;
  }

  async function createUser(input: {
    email: string;
    userType: UserType;
    firstName: string;
    lastName: string;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        userType: input.userType,
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

  async function createApplicantAccount(): Promise<{
    userId: string;
    applicantId: string;
  }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/accounts`)
      .send({
        fullName: 'Sprint 18C Security Applicant',
        email: `${marker}-applicant@example.test`,
        password: PASSWORD,
        phoneNumber: '+20 100 000 0000',
        city: 'Cairo',
        relationship: 'guardian',
      })
      .expect(201);

    createdUserIds.push(response.body.userId);
    createdProfileIds.push(response.body.applicantId);

    return {
      userId: response.body.userId,
      applicantId: response.body.applicantId,
    };
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

  function expectNoForbiddenPublicFields(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'organizationId',
      'schoolId',
      'status',
      'deletedAt',
      'createdAt',
      'updatedAt',
      'entitlement',
      'featureControl',
      'featureControls',
      'billing',
      'subscription',
      'plan',
      'quota',
      'staff',
      'studentCount',
      'applicantCount',
      'studentSeatLimit',
      staffEmail,
      entitlementId,
      featureControlId,
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
          { resourceId: { in: createdProfileIds } },
          { schoolId: { in: createdSchoolIds } },
          { organizationId: { in: createdOrganizationIds } },
        ],
      },
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
    await prisma.schoolFeatureControl.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.schoolEntitlement.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
    await prisma.schoolProfile.deleteMany({
      where: { schoolId: { in: createdSchoolIds } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: createdSchoolIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrganizationIds } },
    });
  }
});
