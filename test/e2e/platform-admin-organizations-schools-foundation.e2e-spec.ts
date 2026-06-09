import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AuditOutcome,
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
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';

const GLOBAL_PREFIX = '/api/v1';
const TEST_PREFIX = `platform-admin-e2e-${Date.now()}`;
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
];

const DEFERRED_ROUTES = [
  'GET /api/v1/platform-admin/features',
  'GET /api/v1/platform-admin/entitlements',
  'GET /api/v1/platform-admin/subscriptions',
  'GET /api/v1/platform-admin/audit-logs',
  'GET /api/v1/platform-admin/billing',
  'GET /api/v1/platform-admin/invoices',
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

describe('Sprint 17B Platform Admin Organizations/Schools Foundation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let platformEmail: string;
  let platformUserId: string;
  let accessToken: string;

  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    await ensurePlatformPermissions();

    platformEmail = `${TEST_PREFIX}-platform@moazez.local`;
    platformUserId = await createPlatformUser(platformEmail);

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

    accessToken = await login(platformEmail);
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

  it('returns stable platform overview counters and deferred markers', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/overview`)
      .set('Authorization', `Bearer ${accessToken}`)
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

  it('manages organization lifecycle without cascading school state', async () => {
    const organization = await createOrganization(
      'Lifecycle Org',
      'lifecycle-org',
    );

    const listed = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/organizations`)
      .query({ search: TEST_PREFIX, limit: 100 })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      listed.body.items.map(
        (item: { organizationId: string }) => item.organizationId,
      ),
    ).toContain(organization.organizationId);

    const detail = await request(app.getHttpServer())
      .get(
        `${GLOBAL_PREFIX}/platform-admin/organizations/${organization.organizationId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(detail.body).toMatchObject({
      organizationId: organization.organizationId,
      name: organization.name,
      slug: organization.slug,
      status: OrganizationStatus.ACTIVE,
      schoolsCount: 0,
      activeSchoolsCount: 0,
    });

    const updated = await request(app.getHttpServer())
      .patch(
        `${GLOBAL_PREFIX}/platform-admin/organizations/${organization.organizationId}`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `${TEST_PREFIX} Lifecycle Org Updated`,
        slug: `${TEST_PREFIX}-lifecycle-org-updated`,
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      name: `${TEST_PREFIX} Lifecycle Org Updated`,
      slug: `${TEST_PREFIX}-lifecycle-org-updated`,
    });

    const school = await createSchool(
      organization.organizationId,
      'Lifecycle School',
      'lifecycle-school',
    );

    const suspended = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/platform-admin/organizations/${organization.organizationId}/suspend`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(suspended.body.status).toBe(OrganizationStatus.SUSPENDED);

    const activated = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/platform-admin/organizations/${organization.organizationId}/activate`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(activated.body.status).toBe(OrganizationStatus.ACTIVE);

    const archived = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/platform-admin/organizations/${organization.organizationId}/archive`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(archived.body.status).toBe(OrganizationStatus.ARCHIVED);

    const stillActiveSchool = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/schools/${school.schoolId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(stillActiveSchool.body.status).toBe(SchoolStatus.ACTIVE);
  });

  it('manages school lifecycle across organizations', async () => {
    const organization = await createOrganization(
      'School Ops Org',
      'school-ops-org',
    );
    const school = await createSchool(
      organization.organizationId,
      'School Ops',
      'school-ops',
    );

    const listed = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/schools`)
      .query({ organizationId: organization.organizationId, limit: 100 })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      listed.body.items.map((item: { schoolId: string }) => item.schoolId),
    ).toContain(school.schoolId);

    const detail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/schools/${school.schoolId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(detail.body).toMatchObject({
      schoolId: school.schoolId,
      organizationId: organization.organizationId,
      organizationName: organization.name,
      name: school.name,
      slug: school.slug,
      status: SchoolStatus.ACTIVE,
    });

    const updated = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/platform-admin/schools/${school.schoolId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `${TEST_PREFIX} School Ops Updated`,
        slug: `${TEST_PREFIX}-school-ops-updated`,
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      name: `${TEST_PREFIX} School Ops Updated`,
      slug: `${TEST_PREFIX}-school-ops-updated`,
    });

    const suspended = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/platform-admin/schools/${school.schoolId}/suspend`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(suspended.body.status).toBe(SchoolStatus.SUSPENDED);

    const activated = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/platform-admin/schools/${school.schoolId}/activate`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(activated.body.status).toBe(SchoolStatus.ACTIVE);

    const archived = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/platform-admin/schools/${school.schoolId}/archive`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(archived.body.status).toBe(SchoolStatus.ARCHIVED);
  });

  it('rejects duplicate slugs and allows same school slug in different organizations', async () => {
    const organization = await createOrganization(
      'Duplicate Org',
      'duplicate-org',
    );

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/platform-admin/organizations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `${TEST_PREFIX} Duplicate Org Again`,
        slug: `${TEST_PREFIX}-duplicate-org`,
      })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'platform.organization.slug_taken',
        );
      });

    const firstSchool = await createSchool(
      organization.organizationId,
      'Duplicate One',
      'duplicate-school',
    );

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/platform-admin/organizations/${organization.organizationId}/schools`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `${TEST_PREFIX} Duplicate Two`,
        slug: 'duplicate-school',
      })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('platform.school.slug_taken');
      });

    const secondOrganization = await createOrganization(
      'Second Duplicate Org',
      'second-duplicate-org',
    );
    const secondSchool = await createSchool(
      secondOrganization.organizationId,
      'Duplicate Slug Elsewhere',
      'duplicate-school',
    );

    expect(firstSchool.slug).toBe(secondSchool.slug);
    expect(firstSchool.organizationId).not.toBe(secondSchool.organizationId);
  });

  it('rejects school creation under archived organizations', async () => {
    const organization = await createOrganization(
      'Archived Org',
      'archived-org',
    );

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/platform-admin/organizations/${organization.organizationId}/archive`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/platform-admin/organizations/${organization.organizationId}/schools`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `${TEST_PREFIX} Should Not Exist`,
        slug: 'should-not-exist',
      })
      .expect(409)
      .expect((response) => {
        expect(response.body?.error?.code).toBe(
          'platform.organization.archived',
        );
      });
  });

  it('audits sensitive platform mutations with sanitized metadata', async () => {
    const logs = await prisma.auditLog.findMany({
      where: {
        actorId: platformUserId,
        module: 'platform_admin',
        outcome: AuditOutcome.SUCCESS,
      },
      select: {
        action: true,
        resourceType: true,
        before: true,
        after: true,
        organizationId: true,
        schoolId: true,
      },
    });

    expect(logs.map((log) => log.action)).toEqual(
      expect.arrayContaining([
        'platform.organization.create',
        'platform.organization.update',
        'platform.organization.suspend',
        'platform.organization.activate',
        'platform.organization.archive',
        'platform.school.create',
        'platform.school.update',
        'platform.school.suspend',
        'platform.school.activate',
        'platform.school.archive',
      ]),
    );
    expect(logs.some((log) => log.organizationId && !log.schoolId)).toBe(true);
    expect(logs.some((log) => log.organizationId && log.schoolId)).toBe(true);

    const serialized = JSON.stringify(logs);
    for (const forbidden of [
      'passwordHash',
      'refreshTokenHash',
      'temporaryPassword',
      'token',
      'encryptedPassword',
      'encryptedApiKey',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('keeps deferred routes absent and avoids provisioning side effects', async () => {
    const routes = listRegisteredRoutes();
    for (const route of DEFERRED_ROUTES) {
      expect(routes).not.toContain(route);
    }
    expect(routes).toContain('POST /api/v1/platform-admin/school-provisioning');

    for (const route of [
      'features',
      'entitlements',
      'subscriptions',
      'audit-logs',
      'billing',
      'invoices',
    ]) {
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/platform-admin/${route}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    }

    await expectNoProvisioningSideEffects();
  });

  async function createOrganization(
    label: string,
    slugSuffix: string,
  ): Promise<{
    organizationId: string;
    name: string;
    slug: string;
    status: OrganizationStatus;
  }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/platform-admin/organizations`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: `${TEST_PREFIX} ${label}`,
        slug: `${TEST_PREFIX}-${slugSuffix}`,
      })
      .expect(201);

    createdOrganizationIds.push(response.body.organizationId);

    expect(response.body).toMatchObject({
      organizationId: expect.any(String),
      name: `${TEST_PREFIX} ${label}`,
      slug: `${TEST_PREFIX}-${slugSuffix}`,
      status: OrganizationStatus.ACTIVE,
      schoolsCount: 0,
      activeSchoolsCount: 0,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    return response.body;
  }

  async function createSchool(
    organizationId: string,
    label: string,
    slug: string,
  ): Promise<{
    schoolId: string;
    organizationId: string;
    organizationName: string;
    name: string;
    slug: string;
    status: SchoolStatus;
  }> {
    const usersBefore = await prisma.user.count();
    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/platform-admin/organizations/${organizationId}/schools`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: `${TEST_PREFIX} ${label}`, slug })
      .expect(201);
    const usersAfter = await prisma.user.count();

    createdSchoolIds.push(response.body.schoolId);

    expect(usersAfter).toBe(usersBefore);
    expect(response.body).toMatchObject({
      schoolId: expect.any(String),
      organizationId,
      name: `${TEST_PREFIX} ${label}`,
      slug,
      status: SchoolStatus.ACTIVE,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    return response.body;
  }

  async function expectNoProvisioningSideEffects(): Promise<void> {
    const [profiles, loginSettings, emailConnections] = await Promise.all([
      prisma.schoolProfile.count({
        where: { schoolId: { in: createdSchoolIds } },
      }),
      prisma.schoolLoginSettings.count({
        where: { schoolId: { in: createdSchoolIds } },
      }),
      prisma.schoolEmailConnection.count({
        where: { schoolId: { in: createdSchoolIds } },
      }),
    ]);

    expect(profiles).toBe(0);
    expect(loginSettings).toBe(0);
    expect(emailConnections).toBe(0);
  }

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

  async function createPlatformUser(email: string): Promise<string> {
    const passwordHash = await argon2.hash(PASSWORD, ARGON2_OPTIONS);
    const user = await prisma.user.create({
      data: {
        email,
        firstName: 'Platform',
        lastName: 'Admin',
        userType: UserType.PLATFORM_USER,
        status: UserStatus.ACTIVE,
        passwordHash,
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return response.body.accessToken;
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
