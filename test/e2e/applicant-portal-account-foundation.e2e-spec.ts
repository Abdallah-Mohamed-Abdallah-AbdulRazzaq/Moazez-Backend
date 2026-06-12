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
const APPLICANT_PASSWORD = 'Applicant18BPass!';
const PARENT_PASSWORD = 'Parent18BPass!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
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

describe('Applicant Portal account foundation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;

  let organizationId = '';
  let schoolId = '';
  let parentRoleId = '';
  let parentUserId = '';
  let guardianId = '';
  let applicantUserId = '';
  let applicantProfileId = '';
  let accessToken = '';

  const suffix = randomUUID().split('-')[0];
  const marker = `s18b-applicant-${suffix}`;
  const createdUserIds: string[] = [];
  const createdProfileIds: string[] = [];
  const createdGuardianIds: string[] = [];
  const createdMembershipUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org`,
        name: `Sprint 18B Org ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationId = organization.id;
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId,
        slug: `${marker}-school`,
        name: `Sprint 18B School ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolId = school.id;
    createdSchoolIds.push(school.id);

    const parentRole = await prisma.role.create({
      data: {
        schoolId,
        key: `${marker}-parent`,
        name: `Sprint 18B Parent ${suffix}`,
        isSystem: false,
      },
      select: { id: true },
    });
    parentRoleId = parentRole.id;
    createdRoleIds.push(parentRole.id);

    parentUserId = await createUser({
      email: `${marker}-parent@example.test`,
      password: PARENT_PASSWORD,
      userType: UserType.PARENT,
      firstName: 'Existing',
      lastName: 'Parent',
      roleId: parentRoleId,
      organizationId,
      schoolId,
    });
    createdMembershipUserIds.push(parentUserId);

    const guardian = await prisma.guardian.create({
      data: {
        schoolId,
        organizationId,
        userId: parentUserId,
        firstName: 'Existing',
        lastName: 'Guardian',
        phone: `${marker}-guardian-phone`,
        email: `${marker}-guardian@example.test`,
        relation: 'mother',
        isPrimary: true,
      },
      select: { id: true },
    });
    guardianId = guardian.id;
    createdGuardianIds.push(guardian.id);

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
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
      await cleanupData();
    } finally {
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registers the implemented Applicant Portal route surface while keeping deferred routes absent', async () => {
    const routes = listRegisteredRoutes();

    for (const implementedRoute of [
      'POST /api/v1/applicant-portal/accounts',
      'GET /api/v1/applicant-portal/profile',
      'GET /api/v1/applicant-portal/schools',
      'GET /api/v1/applicant-portal/schools/:schoolId',
      'GET /api/v1/applicant-portal/schools/:schoolId/admission-required-documents',
      'POST /api/v1/applicant-portal/requests',
      'GET /api/v1/applicant-portal/requests',
      'GET /api/v1/applicant-portal/requests/:requestId',
      'POST /api/v1/applicant-portal/requests/:requestId/submit',
      'POST /api/v1/applicant-portal/requests/:requestId/documents',
      'GET /api/v1/applicant-portal/requests/:requestId/documents',
      'GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId',
      'GET /api/v1/applicant-portal/requests/:requestId/documents/:documentId/download',
      'POST /api/v1/applicant-portal/requests/:requestId/documents/:documentId/replacements',
      'DELETE /api/v1/applicant-portal/requests/:requestId/documents/:documentId',
      'GET /api/v1/admissions/applications/:applicationId/documents',
    ]) {
      expect(routes).toContain(implementedRoute);
    }

    for (const deferredRoute of [
      'PATCH /api/v1/applicant-portal/requests/:requestId/documents/:documentId',
      'POST /api/v1/applicant-portal/uploads',
      'POST /api/v1/applicant-portal/requests/:requestId/convert-to-parent',
      'POST /api/v1/applicant-portal/requests/:requestId/convert-to-guardian',
      'POST /api/v1/applicant-portal/requests/:requestId/convert-to-student',
      'POST /api/v1/applicant-portal/requests/:requestId/convert-to-enrollment',
      'POST /api/v1/applicant-portal/conversions',
      'POST /api/v1/applicant-portal/requests/:requestId/reopen-document-collection',
      'PATCH /api/v1/admissions/applications/:applicationId/documents/:documentId',
      'POST /api/v1/admissions/applications/:applicationId/documents/:documentId/accept',
      'POST /api/v1/admissions/applications/:applicationId/documents/:documentId/reject',
      'POST /api/v1/admissions/applications/:applicationId/documents/:documentId/request-replacement',
      'POST /api/v1/admissions/applications/:applicationId/documents/:documentId/reopen',
    ]) {
      expect(routes).not.toContain(deferredRoute);
    }

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/applicant-portal/schools/${schoolId}/admission-required-documents`,
      )
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ data: [] });
      });

    for (const unauthenticatedRouteCheck of [
      {
        method: 'post' as const,
        path: `${GLOBAL_PREFIX}/applicant-portal/requests`,
      },
      {
        method: 'get' as const,
        path: `${GLOBAL_PREFIX}/applicant-portal/requests`,
      },
      {
        method: 'get' as const,
        path: `${GLOBAL_PREFIX}/applicant-portal/requests/${randomUUID()}`,
      },
      {
        method: 'post' as const,
        path: `${GLOBAL_PREFIX}/applicant-portal/requests/${randomUUID()}/submit`,
      },
      {
        method: 'post' as const,
        path: `${GLOBAL_PREFIX}/applicant-portal/requests/${randomUUID()}/documents`,
      },
      {
        method: 'get' as const,
        path: `${GLOBAL_PREFIX}/applicant-portal/requests/${randomUUID()}/documents`,
      },
      {
        method: 'get' as const,
        path: `${GLOBAL_PREFIX}/applicant-portal/requests/${randomUUID()}/documents/${randomUUID()}`,
      },
      {
        method: 'get' as const,
        path: `${GLOBAL_PREFIX}/applicant-portal/requests/${randomUUID()}/documents/${randomUUID()}/download`,
      },
      {
        method: 'post' as const,
        path: `${GLOBAL_PREFIX}/applicant-portal/requests/${randomUUID()}/documents/${randomUUID()}/replacements`,
      },
      {
        method: 'delete' as const,
        path: `${GLOBAL_PREFIX}/applicant-portal/requests/${randomUUID()}/documents/${randomUUID()}`,
      },
      {
        method: 'get' as const,
        path: `${GLOBAL_PREFIX}/admissions/applications/${randomUUID()}/documents`,
      },
    ]) {
      await request(app.getHttpServer())
        [unauthenticatedRouteCheck.method](unauthenticatedRouteCheck.path)
        .expect(401);
    }

    for (const deferredRouteCheck of [
      {
        method: 'patch' as const,
        path: `${GLOBAL_PREFIX}/applicant-portal/requests/${randomUUID()}/documents/${randomUUID()}`,
      },
    ]) {
      await request(app.getHttpServer())
        [deferredRouteCheck.method](deferredRouteCheck.path)
        .set('Authorization', 'Bearer definitely-not-valid')
        .expect(404);
    }
  });

  it('creates an applicant account, allows applicant profile read, and does not create school membership', async () => {
    const createResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/applicant-portal/accounts`)
      .send({
        fullName: 'Sprint 18B Applicant',
        email: `${marker}-applicant@example.test`,
        password: APPLICANT_PASSWORD,
        phoneNumber: '+20 100 000 0000',
        city: 'Cairo',
        relationship: 'guardian',
      })
      .expect(201);

    applicantUserId = createResponse.body.userId;
    applicantProfileId = createResponse.body.applicantId;
    createdUserIds.push(applicantUserId);
    createdProfileIds.push(applicantProfileId);

    expect(createResponse.body).toMatchObject({
      applicantId: applicantProfileId,
      userId: applicantUserId,
      fullName: 'Sprint 18B Applicant',
      email: `${marker}-applicant@example.test`,
      loginEmail: `${marker}-applicant@example.test`,
      contactEmail: `${marker}-applicant@example.test`,
      phoneNumber: '+20 100 000 0000',
      city: 'Cairo',
      relationship: 'guardian',
      userType: 'applicant',
    });
    expect(createResponse.body).not.toHaveProperty('accessToken');
    expect(createResponse.body).not.toHaveProperty('refreshToken');
    expectSanitized(createResponse.body);

    const applicantDb = await prisma.user.findUniqueOrThrow({
      where: { id: applicantUserId },
      include: {
        memberships: true,
        applicantProfile: true,
        guardianProfiles: true,
        studentProfile: true,
      },
    });
    expect(applicantDb.userType).toBe(UserType.APPLICANT);
    expect(applicantDb.status).toBe(UserStatus.ACTIVE);
    expect(applicantDb.memberships).toHaveLength(0);
    expect(applicantDb.applicantProfile?.id).toBe(applicantProfileId);
    expect(applicantDb.guardianProfiles).toHaveLength(0);
    expect(applicantDb.studentProfile).toBeNull();

    const loginResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({
        email: `${marker}-applicant@example.test`,
        password: APPLICANT_PASSWORD,
      })
      .expect(200);
    accessToken = loginResponse.body.accessToken;
    expect(loginResponse.body.user).toMatchObject({
      id: applicantUserId,
      userType: UserType.APPLICANT,
    });

    const profileResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/applicant-portal/profile`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(profileResponse.body).toMatchObject({
      applicantId: applicantProfileId,
      userId: applicantUserId,
      fullName: 'Sprint 18B Applicant',
      email: `${marker}-applicant@example.test`,
      loginEmail: `${marker}-applicant@example.test`,
      contactEmail: `${marker}-applicant@example.test`,
      phoneNumber: '+20 100 000 0000',
      city: 'Cairo',
      relationship: 'guardian',
      userType: 'applicant',
    });
    expectSanitized(profileResponse.body);

    await expectApplicantDeniedFromNonApplicantSurfaces(accessToken);
  });

  it('leaves existing school-managed parent/guardian data unchanged', async () => {
    const parent = await prisma.user.findUniqueOrThrow({
      where: { id: parentUserId },
      include: {
        memberships: true,
        guardianProfiles: true,
        applicantProfile: true,
      },
    });

    expect(parent.userType).toBe(UserType.PARENT);
    expect(parent.memberships).toHaveLength(1);
    expect(parent.memberships[0]).toMatchObject({
      organizationId,
      schoolId,
      userType: UserType.PARENT,
      status: MembershipStatus.ACTIVE,
    });
    expect(parent.guardianProfiles.map((guardian) => guardian.id)).toContain(
      guardianId,
    );
    expect(parent.applicantProfile).toBeNull();
  });

  async function createUser(params: {
    email: string;
    password: string;
    userType: UserType;
    firstName: string;
    lastName: string;
    roleId: string;
    organizationId: string;
    schoolId: string;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(params.password, ARGON2_OPTIONS),
        passwordChangedAt: new Date(),
        credentialVersion: 1,
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: params.organizationId,
        schoolId: params.schoolId,
        roleId: params.roleId,
        userType: params.userType,
        status: MembershipStatus.ACTIVE,
      },
    });

    return user.id;
  }

  async function expectApplicantDeniedFromNonApplicantSurfaces(
    token: string,
  ): Promise<void> {
    const deniedRoutes = [
      `${GLOBAL_PREFIX}/parent/home`,
      `${GLOBAL_PREFIX}/student/home`,
      `${GLOBAL_PREFIX}/teacher/home`,
      `${GLOBAL_PREFIX}/admissions/applications`,
      `${GLOBAL_PREFIX}/platform-admin/overview`,
    ];

    for (const route of deniedRoutes) {
      const response = await request(app.getHttpServer())
        .get(route)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body?.error?.code).toBe('auth.scope.missing');
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

  function expectSanitized(body: unknown): void {
    const serialized = JSON.stringify(body);
    for (const forbidden of [
      'password',
      'passwordHash',
      'schoolId',
      'organizationId',
      'memberships',
      'guardianId',
      'studentId',
      'enrollmentId',
      'accessToken',
      'refreshToken',
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
        ],
      },
    });
    await prisma.applicantProfile.deleteMany({
      where: { id: { in: createdProfileIds } },
    });
    await prisma.guardian.deleteMany({
      where: { id: { in: createdGuardianIds } },
    });
    await prisma.membership.deleteMany({
      where: { userId: { in: createdMembershipUserIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
    await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
    await prisma.school.deleteMany({
      where: { id: { in: createdSchoolIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrganizationIds } },
    });
  }
});
