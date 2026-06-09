import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolFeatureControlSource,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';

const GLOBAL_PREFIX = '/api/v1';
const TEST_PREFIX = `platform-admin-security-${Date.now()}`;
const PASSWORD = 'Platform17B!Pass';

const PLATFORM_PERMISSIONS = [
  {
    code: 'platform.overview.view',
    module: 'platform',
    resource: 'overview',
    action: 'view',
    description: 'View Platform Admin overview counters.',
  },
  {
    code: 'platform.organizations.view',
    module: 'platform',
    resource: 'organizations',
    action: 'view',
    description: 'View Platform Admin organizations.',
  },
  {
    code: 'platform.organizations.manage',
    module: 'platform',
    resource: 'organizations',
    action: 'manage',
    description: 'Manage Platform Admin organizations.',
  },
  {
    code: 'platform.schools.view',
    module: 'platform',
    resource: 'schools',
    action: 'view',
    description: 'View Platform Admin schools.',
  },
  {
    code: 'platform.schools.manage',
    module: 'platform',
    resource: 'schools',
    action: 'manage',
    description: 'Manage Platform Admin schools.',
  },
  {
    code: 'platform.entitlements.view',
    module: 'platform',
    resource: 'entitlements',
    action: 'view',
    description: 'View Platform Admin school entitlements.',
  },
  {
    code: 'platform.entitlements.manage',
    module: 'platform',
    resource: 'entitlements',
    action: 'manage',
    description: 'Manage Platform Admin school entitlements.',
  },
  {
    code: 'platform.features.view',
    module: 'platform',
    resource: 'features',
    action: 'view',
    description: 'View Platform Admin school feature controls.',
  },
  {
    code: 'platform.features.manage',
    module: 'platform',
    resource: 'features',
    action: 'manage',
    description: 'Manage Platform Admin school feature controls.',
  },
];

const DEFERRED_ROUTES = [
  'GET /api/v1/platform-admin/features',
  'GET /api/v1/platform-admin/entitlements',
  'GET /api/v1/platform-admin/subscriptions',
  'GET /api/v1/platform-admin/audit-logs',
  'GET /api/v1/platform-admin/billing',
  'GET /api/v1/platform-admin/invoices',
  'GET /api/v1/platform-admin/payments',
];

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

jest.setTimeout(90000);

describe('Sprint 17B Platform Admin access boundary (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let baseOrganizationId: string;
  let baseSchoolId: string;
  let platformUserEmail: string;
  let limitedPlatformUserEmail: string;
  let entitlementViewOnlyPlatformEmail: string;
  let entitlementManageOnlyPlatformEmail: string;
  let featureViewOnlyPlatformEmail: string;
  let featureManageOnlyPlatformEmail: string;

  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    await ensurePlatformPermissions();
    await ensureBaseTenant();

    platformUserEmail = `${TEST_PREFIX}-platform@moazez.local`;
    limitedPlatformUserEmail = `${TEST_PREFIX}-platform-limited@moazez.local`;
    entitlementViewOnlyPlatformEmail = `${TEST_PREFIX}-ent-view@moazez.local`;
    entitlementManageOnlyPlatformEmail = `${TEST_PREFIX}-ent-manage@moazez.local`;
    featureViewOnlyPlatformEmail = `${TEST_PREFIX}-feature-view@moazez.local`;
    featureManageOnlyPlatformEmail = `${TEST_PREFIX}-feature-manage@moazez.local`;

    await createNoMembershipUser(platformUserEmail, UserType.PLATFORM_USER);
    await createActorWithMembership({
      email: limitedPlatformUserEmail,
      userType: UserType.PLATFORM_USER,
      roleId: await createRoleWithPermissions(
        baseSchoolId,
        `${TEST_PREFIX}-platform-denied`,
        [],
      ),
      organizationId: baseOrganizationId,
      schoolId: baseSchoolId,
    });
    await createActorWithMembership({
      email: entitlementViewOnlyPlatformEmail,
      userType: UserType.PLATFORM_USER,
      roleId: await createRoleWithPermissions(
        baseSchoolId,
        `${TEST_PREFIX}-platform-entitlement-view`,
        ['platform.entitlements.view'],
      ),
      organizationId: baseOrganizationId,
      schoolId: baseSchoolId,
    });
    await createActorWithMembership({
      email: entitlementManageOnlyPlatformEmail,
      userType: UserType.PLATFORM_USER,
      roleId: await createRoleWithPermissions(
        baseSchoolId,
        `${TEST_PREFIX}-platform-entitlement-manage`,
        ['platform.entitlements.manage'],
      ),
      organizationId: baseOrganizationId,
      schoolId: baseSchoolId,
    });
    await createActorWithMembership({
      email: featureViewOnlyPlatformEmail,
      userType: UserType.PLATFORM_USER,
      roleId: await createRoleWithPermissions(
        baseSchoolId,
        `${TEST_PREFIX}-platform-feature-view`,
        ['platform.features.view'],
      ),
      organizationId: baseOrganizationId,
      schoolId: baseSchoolId,
    });
    await createActorWithMembership({
      email: featureManageOnlyPlatformEmail,
      userType: UserType.PLATFORM_USER,
      roleId: await createRoleWithPermissions(
        baseSchoolId,
        `${TEST_PREFIX}-platform-feature-manage`,
        ['platform.features.manage'],
      ),
      organizationId: baseOrganizationId,
      schoolId: baseSchoolId,
    });

    await createSystemRoleActor({
      email: `${TEST_PREFIX}-school-admin@moazez.local`,
      userType: UserType.SCHOOL_USER,
      roleKey: 'school_admin',
      schoolId: baseSchoolId,
    });
    await createSystemRoleActor({
      email: `${TEST_PREFIX}-teacher@moazez.local`,
      userType: UserType.TEACHER,
      roleKey: 'teacher',
      schoolId: baseSchoolId,
    });
    await createSystemRoleActor({
      email: `${TEST_PREFIX}-parent@moazez.local`,
      userType: UserType.PARENT,
      roleKey: 'parent',
      schoolId: baseSchoolId,
    });
    await createSystemRoleActor({
      email: `${TEST_PREFIX}-student@moazez.local`,
      userType: UserType.STUDENT,
      roleKey: 'student',
      schoolId: baseSchoolId,
    });
    await createSystemRoleActor({
      email: `${TEST_PREFIX}-organization-user@moazez.local`,
      userType: UserType.ORGANIZATION_USER,
      roleKey: 'organization_admin',
      schoolId: null,
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BullmqService)
      .useValue(createNoopBullmqService())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_PREFIX.replace(/^\//, ''));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { actorId: { in: createdUserIds } },
            { organizationId: { in: createdOrganizationIds } },
            { schoolId: { in: createdSchoolIds } },
          ],
        },
      });
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.schoolLoginSettings.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.schoolEntitlement.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.schoolFeatureControl.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: createdRoleIds } },
      });
      await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.school.deleteMany({
        where: { id: { in: createdSchoolIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrganizationIds } },
      });
      await prisma.$disconnect();
    }
  });

  it('registers the Sprint 17D platform-admin route surface', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toEqual(
      expect.arrayContaining([
        'GET /api/v1/platform-admin/overview',
        'GET /api/v1/platform-admin/organizations',
        'POST /api/v1/platform-admin/organizations',
        'GET /api/v1/platform-admin/organizations/:organizationId',
        'PATCH /api/v1/platform-admin/organizations/:organizationId',
        'POST /api/v1/platform-admin/organizations/:organizationId/activate',
        'POST /api/v1/platform-admin/organizations/:organizationId/suspend',
        'POST /api/v1/platform-admin/organizations/:organizationId/archive',
        'GET /api/v1/platform-admin/schools',
        'POST /api/v1/platform-admin/organizations/:organizationId/schools',
        'GET /api/v1/platform-admin/schools/:schoolId',
        'GET /api/v1/platform-admin/schools/:schoolId/entitlement',
        'PUT /api/v1/platform-admin/schools/:schoolId/entitlement',
        'GET /api/v1/platform-admin/schools/:schoolId/features',
        'PUT /api/v1/platform-admin/schools/:schoolId/features',
        'PUT /api/v1/platform-admin/schools/:schoolId/features/:featureKey',
        'PATCH /api/v1/platform-admin/schools/:schoolId',
        'POST /api/v1/platform-admin/schools/:schoolId/activate',
        'POST /api/v1/platform-admin/schools/:schoolId/suspend',
        'POST /api/v1/platform-admin/schools/:schoolId/archive',
        'POST /api/v1/platform-admin/school-provisioning',
      ]),
    );

    for (const route of DEFERRED_ROUTES) {
      expect(routes).not.toContain(route);
    }
  });

  it('denies school and organization-scoped actors from Platform Admin overview', async () => {
    for (const email of [
      `${TEST_PREFIX}-school-admin@moazez.local`,
      `${TEST_PREFIX}-teacher@moazez.local`,
      `${TEST_PREFIX}-parent@moazez.local`,
      `${TEST_PREFIX}-student@moazez.local`,
      `${TEST_PREFIX}-organization-user@moazez.local`,
    ]) {
      const token = await login(email);
      const response = await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/platform-admin/overview`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body?.error?.code).toBe('auth.scope.missing');
    }
  });

  it('requires explicit platform permissions for platform users', async () => {
    const token = await login(limitedPlatformUserEmail);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/overview`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/platform-admin/organizations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `${TEST_PREFIX} denied`, slug: `${TEST_PREFIX}-denied` })
      .expect(403);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/platform-admin/school-provisioning`)
      .set('Authorization', `Bearer ${token}`)
      .send(provisioningPayload('limited-denied'))
      .expect(403);
  });

  it('enforces platform entitlement view/manage permissions separately', async () => {
    const limitedToken = await login(limitedPlatformUserEmail);
    const viewOnlyToken = await login(entitlementViewOnlyPlatformEmail);
    const manageOnlyToken = await login(entitlementManageOnlyPlatformEmail);
    const platformToken = await login(platformUserEmail);

    for (const email of [
      `${TEST_PREFIX}-school-admin@moazez.local`,
      `${TEST_PREFIX}-teacher@moazez.local`,
      `${TEST_PREFIX}-parent@moazez.local`,
      `${TEST_PREFIX}-student@moazez.local`,
      `${TEST_PREFIX}-organization-user@moazez.local`,
    ]) {
      const token = await login(email);

      await request(app.getHttpServer())
        .get(
          `${GLOBAL_PREFIX}/platform-admin/schools/${baseSchoolId}/entitlement`,
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      await request(app.getHttpServer())
        .put(
          `${GLOBAL_PREFIX}/platform-admin/schools/${baseSchoolId}/entitlement`,
        )
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'active', studentSeatLimit: 25 })
        .expect(403);
    }

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/platform-admin/schools/${baseSchoolId}/entitlement`,
      )
      .set('Authorization', `Bearer ${limitedToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/platform-admin/schools/${baseSchoolId}/entitlement`,
      )
      .set('Authorization', `Bearer ${viewOnlyToken}`)
      .send({ status: 'active', studentSeatLimit: 25 })
      .expect(403);

    await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/platform-admin/schools/${baseSchoolId}/entitlement`,
      )
      .set('Authorization', `Bearer ${manageOnlyToken}`)
      .expect(403);

    const readResponse = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/platform-admin/schools/${baseSchoolId}/entitlement`,
      )
      .set('Authorization', `Bearer ${viewOnlyToken}`)
      .expect(200);

    expect(readResponse.body).toMatchObject({
      school: {
        schoolId: baseSchoolId,
        organizationId: baseOrganizationId,
        status: 'active',
      },
      entitlement: null,
      studentSeatUsage: {
        used: expect.any(Number),
        limit: null,
        remaining: null,
        isUnlimited: true,
        isOverLimit: false,
        calculation: 'active_students',
      },
    });

    const upsertResponse = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/platform-admin/schools/${baseSchoolId}/entitlement`,
      )
      .set('Authorization', `Bearer ${platformToken}`)
      .send({
        status: 'active',
        startsAt: '2026-06-01T00:00:00.000Z',
        endsAt: '2027-06-01T00:00:00.000Z',
        studentSeatLimit: 25,
        notes: 'Security suite entitlement',
      })
      .expect(200);

    expect(upsertResponse.body).toMatchObject({
      school: {
        schoolId: baseSchoolId,
        organizationId: baseOrganizationId,
        status: 'active',
      },
      entitlement: {
        entitlementId: expect.any(String),
        status: 'active',
        startsAt: '2026-06-01T00:00:00.000Z',
        endsAt: '2027-06-01T00:00:00.000Z',
        studentSeatLimit: 25,
      },
      studentSeatUsage: {
        limit: 25,
        calculation: 'active_students',
      },
      deferred: {
        seatLimitEnforcement: 'deferred',
        featureControl: 'deferred',
        billing: 'out_of_scope_v1',
        invoices: 'out_of_scope_v1',
        payments: 'out_of_scope_v1',
      },
    });

    const serialized = JSON.stringify(upsertResponse.body);
    for (const forbidden of [
      'passwordHash',
      'refreshTokenHash',
      'encryptedPassword',
      'encryptedApiKey',
      'guardian',
      'attendance',
      'gradeItems',
      'raw',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('enforces platform feature view/manage permissions separately', async () => {
    const limitedToken = await login(limitedPlatformUserEmail);
    const viewOnlyToken = await login(featureViewOnlyPlatformEmail);
    const manageOnlyToken = await login(featureManageOnlyPlatformEmail);

    for (const email of [
      `${TEST_PREFIX}-school-admin@moazez.local`,
      `${TEST_PREFIX}-teacher@moazez.local`,
      `${TEST_PREFIX}-parent@moazez.local`,
      `${TEST_PREFIX}-student@moazez.local`,
      `${TEST_PREFIX}-organization-user@moazez.local`,
    ]) {
      const token = await login(email);

      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/platform-admin/schools/${baseSchoolId}/features`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      await request(app.getHttpServer())
        .put(
          `${GLOBAL_PREFIX}/platform-admin/schools/${baseSchoolId}/features/dashboard`,
        )
        .set('Authorization', `Bearer ${token}`)
        .send({ enabled: true, source: 'platform' })
        .expect(403);
    }

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/schools/${baseSchoolId}/features`)
      .set('Authorization', `Bearer ${limitedToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/platform-admin/schools/${baseSchoolId}/features/dashboard`,
      )
      .set('Authorization', `Bearer ${viewOnlyToken}`)
      .send({ enabled: true, source: 'platform' })
      .expect(403);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/schools/${baseSchoolId}/features`)
      .set('Authorization', `Bearer ${manageOnlyToken}`)
      .expect(403);

    const readResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/schools/${baseSchoolId}/features`)
      .set('Authorization', `Bearer ${viewOnlyToken}`)
      .expect(200);

    expect(readResponse.body).toMatchObject({
      school: {
        schoolId: baseSchoolId,
        organizationId: baseOrganizationId,
        status: 'active',
      },
      summary: {
        totalKnownFeatures: 15,
        configured: 0,
        enabled: 0,
        disabled: 15,
      },
      deferred: {
        runtimeEnforcement: 'deferred',
        planAutomation: 'deferred',
        billing: 'out_of_scope_v1',
        rollouts: 'deferred',
      },
    });
    expect(readResponse.body.features).toHaveLength(15);

    const upsertResponse = await request(app.getHttpServer())
      .put(
        `${GLOBAL_PREFIX}/platform-admin/schools/${baseSchoolId}/features/dashboard`,
      )
      .set('Authorization', `Bearer ${manageOnlyToken}`)
      .send({
        enabled: true,
        source: 'platform',
        notes: 'Security suite feature control',
      })
      .expect(200);

    expect(upsertResponse.body.summary).toMatchObject({
      totalKnownFeatures: 15,
      configured: 1,
      enabled: 1,
      disabled: 14,
    });
    expect(
      upsertResponse.body.features.find(
        (feature: { featureKey: string }) => feature.featureKey === 'dashboard',
      ),
    ).toMatchObject({
      featureKey: 'dashboard',
      enabled: true,
      configured: true,
      source: 'platform',
    });

    const bulkResponse = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/platform-admin/schools/${baseSchoolId}/features`)
      .set('Authorization', `Bearer ${manageOnlyToken}`)
      .send({
        features: [
          {
            featureKey: 'dashboard',
            enabled: false,
            source: 'platform',
          },
          {
            featureKey: 'teacher_app',
            enabled: false,
            source: 'platform',
            notes: 'Deferred until onboarding',
          },
        ],
      })
      .expect(200);

    expect(bulkResponse.body.summary).toMatchObject({
      totalKnownFeatures: 15,
      configured: 2,
      enabled: 0,
      disabled: 15,
    });
    await expect(
      prisma.schoolFeatureControl.findUniqueOrThrow({
        where: {
          schoolId_featureKey: {
            schoolId: baseSchoolId,
            featureKey: 'dashboard',
          },
        },
        select: { source: true, enabled: true },
      }),
    ).resolves.toEqual({
      source: SchoolFeatureControlSource.PLATFORM,
      enabled: false,
    });

    const serialized = JSON.stringify(bulkResponse.body);
    for (const forbidden of [
      'passwordHash',
      'refreshTokenHash',
      'encryptedPassword',
      'encryptedApiKey',
      'guardian',
      'attendanceEntries',
      'gradeItems',
      'billing',
      'invoice',
      'payment',
      'rolloutPercentage',
      'raw',
    ]) {
      if (forbidden === 'billing') {
        expect(serialized).toContain('"billing":"out_of_scope_v1"');
      } else {
        expect(serialized).not.toContain(forbidden);
      }
    }
  });

  it('allows platform users with platform permissions to view overview', async () => {
    const token = await login(platformUserEmail);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/overview`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      generatedAt: expect.any(String),
      organizations: {
        total: expect.any(Number),
        active: expect.any(Number),
        suspended: expect.any(Number),
        archived: expect.any(Number),
      },
      schools: {
        total: expect.any(Number),
        active: expect.any(Number),
        suspended: expect.any(Number),
        archived: expect.any(Number),
      },
      entitlements: {
        total: expect.any(Number),
        active: expect.any(Number),
        trial: expect.any(Number),
        suspended: expect.any(Number),
        expired: expect.any(Number),
        archived: expect.any(Number),
        schoolsOverSeatLimit: expect.any(Number),
      },
      features: {
        knownFeatures: 15,
        configuredSchools: expect.any(Number),
        enabledControls: expect.any(Number),
        disabledControls: expect.any(Number),
      },
      deferred: {
        schoolProvisioning: 'available',
        entitlements: 'available',
        featureControl: 'available',
        billing: 'out_of_scope_v1',
        advancedAnalytics: 'deferred',
      },
    });
  });

  it('denies non-platform actors from school provisioning', async () => {
    for (const email of [
      `${TEST_PREFIX}-school-admin@moazez.local`,
      `${TEST_PREFIX}-teacher@moazez.local`,
      `${TEST_PREFIX}-parent@moazez.local`,
      `${TEST_PREFIX}-student@moazez.local`,
      `${TEST_PREFIX}-organization-user@moazez.local`,
    ]) {
      const token = await login(email);
      const response = await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/platform-admin/school-provisioning`)
        .set('Authorization', `Bearer ${token}`)
        .send(provisioningPayload(`denied-${email.split('@')[0]}`))
        .expect(403);

      expect(response.body?.error?.code).toBe('auth.scope.missing');
    }
  });

  it('allows platform users with platform.schools.manage to provision a school safely', async () => {
    const token = await login(platformUserEmail);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/platform-admin/school-provisioning`)
      .set('Authorization', `Bearer ${token}`)
      .send(provisioningPayload('allowed'))
      .expect(201);

    createdOrganizationIds.push(response.body.organization.organizationId);
    createdSchoolIds.push(response.body.school.schoolId);
    createdUserIds.push(response.body.primaryAdmin.userId);

    expect(response.body).toMatchObject({
      provisioningId: response.body.school.schoolId,
      organization: {
        organizationId: expect.any(String),
        slug: `${TEST_PREFIX}-allowed-org`,
        status: OrganizationStatus.ACTIVE,
      },
      school: {
        schoolId: expect.any(String),
        slug: 'main',
        status: SchoolStatus.ACTIVE,
      },
      loginIdentity: {
        loginDomain: `${TEST_PREFIX}-allowed.moazez.school`,
        primaryAdminLoginEmail: `admin@${TEST_PREFIX}-allowed.moazez.school`,
      },
      primaryAdmin: {
        userId: expect.any(String),
        username: 'admin',
        loginEmail: `admin@${TEST_PREFIX}-allowed.moazez.school`,
        contactEmail: `${TEST_PREFIX}-allowed-admin@example.test`,
        userType: 'school_user',
        status: 'active',
        mustChangePassword: true,
      },
      credentials: {
        deliveryMode: 'manual',
        status: 'manual_pending',
        temporaryPassword: null,
      },
    });

    const serialized = JSON.stringify(response.body);
    for (const forbidden of [
      'passwordHash',
      'tokenHash',
      'refreshTokenHash',
      'encryptedPassword',
      'encryptedApiKey',
      'smtp-secret',
      'requestContext',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('allows platform admins to create and see multiple organizations and schools', async () => {
    const token = await login(platformUserEmail);

    const orgA = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/platform-admin/organizations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `${TEST_PREFIX} Org A`, slug: `${TEST_PREFIX}-org-a` })
      .expect(201);
    createdOrganizationIds.push(orgA.body.organizationId);

    const orgB = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/platform-admin/organizations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `${TEST_PREFIX} Org B`, slug: `${TEST_PREFIX}-org-b` })
      .expect(201);
    createdOrganizationIds.push(orgB.body.organizationId);

    const schoolA = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/platform-admin/organizations/${orgA.body.organizationId}/schools`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `${TEST_PREFIX} School A`, slug: 'main-school' })
      .expect(201);
    createdSchoolIds.push(schoolA.body.schoolId);

    const schoolB = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/platform-admin/organizations/${orgB.body.organizationId}/schools`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `${TEST_PREFIX} School B`, slug: 'main-school' })
      .expect(201);
    createdSchoolIds.push(schoolB.body.schoolId);

    const organizations = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/organizations`)
      .query({ search: TEST_PREFIX, limit: 100 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const organizationIds = organizations.body.items.map(
      (item: { organizationId: string }) => item.organizationId,
    );
    expect(organizationIds).toEqual(
      expect.arrayContaining([
        orgA.body.organizationId,
        orgB.body.organizationId,
      ]),
    );

    const schools = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/schools`)
      .query({ search: TEST_PREFIX, limit: 100 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const schoolIds = schools.body.items.map(
      (item: { schoolId: string }) => item.schoolId,
    );
    expect(schoolIds).toEqual(
      expect.arrayContaining([schoolA.body.schoolId, schoolB.body.schoolId]),
    );
  });

  it('denies cross-platform listing to non-platform actors', async () => {
    const schoolAdminToken = await login(
      `${TEST_PREFIX}-school-admin@moazez.local`,
    );

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/organizations`)
      .set('Authorization', `Bearer ${schoolAdminToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/schools`)
      .set('Authorization', `Bearer ${schoolAdminToken}`)
      .expect(403);
  });

  it('keeps Platform Admin responses free of secret fields', async () => {
    const token = await login(platformUserEmail);
    const overview = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/overview`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const organizations = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/organizations`)
      .query({ search: TEST_PREFIX })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const schools = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/schools`)
      .query({ search: TEST_PREFIX })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const serialized = JSON.stringify({
      overview: overview.body,
      organizations: organizations.body,
      schools: schools.body,
    });

    for (const forbidden of [
      'passwordHash',
      'refreshTokenHash',
      'encryptedPassword',
      'encryptedApiKey',
      'temporaryPassword',
      'requestContext',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('keeps deferred platform routes absent at HTTP runtime', async () => {
    const token = await login(platformUserEmail);

    for (const route of [
      'features',
      'entitlements',
      'subscriptions',
      'audit-logs',
      'billing',
      'invoices',
      'payments',
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/platform-admin/${route}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    }

    for (const route of [
      `schools/${baseSchoolId}/seat-enforcement`,
      `schools/${baseSchoolId}/seat-limit-enforcement`,
      `schools/${baseSchoolId}/features/dashboard/enforcement`,
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/platform-admin/${route}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    }
  });

  async function ensurePlatformPermissions(): Promise<void> {
    for (const permission of PLATFORM_PERMISSIONS) {
      await prisma.permission.upsert({
        where: { code: permission.code },
        update: permission,
        create: permission,
      });
    }

    const platformRole = await prisma.role.findFirst({
      where: {
        key: 'platform_super_admin',
        schoolId: null,
        isSystem: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!platformRole) {
      throw new Error(
        'platform_super_admin system role not found - run `npm run seed` first.',
      );
    }

    const permissions = await prisma.permission.findMany({
      where: { code: { in: PLATFORM_PERMISSIONS.map((item) => item.code) } },
      select: { id: true },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: platformRole.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  }

  async function ensureBaseTenant(): Promise<void> {
    const organization = await prisma.organization.create({
      data: {
        name: `${TEST_PREFIX} Base Organization`,
        slug: `${TEST_PREFIX}-base-org`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);
    baseOrganizationId = organization.id;

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        name: `${TEST_PREFIX} Base School`,
        slug: `${TEST_PREFIX}-base-school`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);
    baseSchoolId = school.id;
  }

  async function createNoMembershipUser(
    email: string,
    userType: UserType,
  ): Promise<string> {
    const passwordHash = await argon2.hash(PASSWORD, ARGON2_OPTIONS);
    const user = await prisma.user.create({
      data: {
        email,
        firstName: 'Platform',
        lastName: 'Actor',
        userType,
        status: UserStatus.ACTIVE,
        passwordHash,
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  async function createSystemRoleActor(params: {
    email: string;
    userType: UserType;
    roleKey: string;
    schoolId: string | null;
  }): Promise<void> {
    const role = await prisma.role.findFirst({
      where: {
        key: params.roleKey,
        schoolId: null,
        isSystem: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!role) {
      throw new Error(`${params.roleKey} system role not found.`);
    }

    await createActorWithMembership({
      email: params.email,
      userType: params.userType,
      roleId: role.id,
      organizationId: baseOrganizationId,
      schoolId: params.schoolId,
    });
  }

  async function createActorWithMembership(params: {
    email: string;
    userType: UserType;
    roleId: string;
    organizationId: string;
    schoolId: string | null;
  }): Promise<void> {
    const userId = await createNoMembershipUser(params.email, params.userType);
    await prisma.membership.create({
      data: {
        userId,
        organizationId: params.organizationId,
        schoolId: params.schoolId,
        roleId: params.roleId,
        userType: params.userType,
        status: MembershipStatus.ACTIVE,
        startedAt: new Date(),
      },
    });
  }

  async function createRoleWithPermissions(
    schoolId: string,
    key: string,
    permissionCodes: string[],
  ): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId,
        key,
        name: key,
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);

    if (permissionCodes.length > 0) {
      const permissions = await prisma.permission.findMany({
        where: { code: { in: permissionCodes } },
        select: { id: true },
      });
      await prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id,
        })),
        skipDuplicates: true,
      });
    }

    return role.id;
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return response.body.accessToken;
  }

  function provisioningPayload(suffix: string) {
    return {
      organization: {
        mode: 'create',
        name: `${TEST_PREFIX} ${suffix} Org`,
        slug: `${TEST_PREFIX}-${suffix}-org`,
      },
      school: {
        name: `${TEST_PREFIX} ${suffix} School`,
        slug: 'main',
      },
      loginIdentity: {
        loginDomain: `${TEST_PREFIX}-${suffix}.moazez.school`,
      },
      primaryAdmin: {
        firstName: 'School',
        lastName: 'Admin',
        username: 'admin',
        contactEmail: `${TEST_PREFIX}-${suffix}-admin@example.test`,
        phone: `+201${String(hashSuffix(`${TEST_PREFIX}-${suffix}`)).padStart(9, '0').slice(-9)}`,
      },
      credentials: {
        deliveryMode: 'manual',
      },
    };
  }

  function hashSuffix(value: string): number {
    return [...value].reduce(
      (hash, char) => (hash * 31 + char.charCodeAt(0)) % 1_000_000_000,
      17,
    );
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

        for (const routePath of paths) {
          for (const method of methods) {
            routes.push(`${method} ${routePath}`);
          }
        }
      }

      if (layer.handle?.stack) {
        collectRoutes(layer.handle.stack, routes);
      }
    }
  }
});

function createNoopBullmqService(): Pick<
  BullmqService,
  'addEmailJob' | 'addImportJob' | 'createWorker' | 'onModuleDestroy'
> {
  return {
    addEmailJob: jest.fn().mockResolvedValue(undefined),
    addImportJob: jest.fn().mockResolvedValue(undefined),
    createWorker: jest.fn().mockReturnValue({ close: jest.fn() }),
    onModuleDestroy: jest.fn().mockResolvedValue(undefined),
  };
}
