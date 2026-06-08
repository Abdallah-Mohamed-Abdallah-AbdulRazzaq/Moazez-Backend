import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AuditOutcome,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolLoginSettingsStatus,
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
const TEST_PREFIX = `platform-admin-17c-${Date.now()}`;
const PASSWORD = 'Platform17C!Pass';

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

type ProvisioningResponse = {
  provisioningId: string;
  organization: {
    organizationId: string;
    name: string;
    slug: string;
    status: OrganizationStatus;
  };
  school: {
    schoolId: string;
    organizationId: string;
    name: string;
    slug: string;
    status: SchoolStatus;
  };
  loginIdentity: {
    loginDomain: string;
    primaryAdminLoginEmail: string;
  };
  primaryAdmin: {
    userId: string;
    username: string;
    loginEmail: string;
    contactEmail: string | null;
    userType: 'school_user';
    status: 'active';
    mustChangePassword: boolean;
  };
  credentials: {
    deliveryMode: 'activation_link' | 'temporary_password' | 'manual';
    status:
      | 'activation_link_deferred'
      | 'temporary_password_ready'
      | 'manual_pending';
    temporaryPassword: string | null;
  };
};

jest.setTimeout(120000);

describe('Sprint 17C Platform Admin school provisioning (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let platformEmail: string;
  let platformUserId: string;
  let accessToken: string;
  let manualProvisioning: ProvisioningResponse;
  let activationProvisioning: ProvisioningResponse;
  let existingOrganizationId: string;

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
        transformOptions: { enableImplicitConversion: false },
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
      await prisma.schoolLoginSettings.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.membership.deleteMany({
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

  it('registers only the Sprint 17C provisioning route plus existing platform routes', () => {
    const routes = listRegisteredRoutes();

    expect(routes).toContain('POST /api/v1/platform-admin/school-provisioning');
    for (const route of [
      'features',
      'entitlements',
      'subscriptions',
      'billing',
      'invoices',
      'audit-logs',
    ]) {
      expect(routes).not.toContain(`GET /api/v1/platform-admin/${route}`);
    }
  });

  it('provisions a new organization, school, login identity, primary admin, and membership using manual mode', async () => {
    const payload = provisioningPayload({
      organization: {
        mode: 'create',
        name: `${TEST_PREFIX} Rowad Group`,
        slug: `${TEST_PREFIX}-rowad`,
      },
      school: {
        name: `${TEST_PREFIX} Rowad Main`,
        slug: 'main',
      },
      loginDomain: `${TEST_PREFIX}-rowad.moazez.school`,
      username: 'admin',
      contactEmail: `${TEST_PREFIX}-rowad-admin@example.test`,
      deliveryMode: 'manual',
    });

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/platform-admin/school-provisioning`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload)
      .expect(201);

    manualProvisioning = response.body;
    trackProvisioning(manualProvisioning);

    expect(manualProvisioning).toMatchObject({
      provisioningId: manualProvisioning.school.schoolId,
      organization: {
        organizationId: expect.any(String),
        name: `${TEST_PREFIX} Rowad Group`,
        slug: `${TEST_PREFIX}-rowad`,
        status: OrganizationStatus.ACTIVE,
      },
      school: {
        schoolId: expect.any(String),
        organizationId: manualProvisioning.organization.organizationId,
        name: `${TEST_PREFIX} Rowad Main`,
        slug: 'main',
        status: SchoolStatus.ACTIVE,
      },
      loginIdentity: {
        loginDomain: `${TEST_PREFIX}-rowad.moazez.school`,
        primaryAdminLoginEmail: `admin@${TEST_PREFIX}-rowad.moazez.school`,
      },
      primaryAdmin: {
        userId: expect.any(String),
        username: 'admin',
        loginEmail: `admin@${TEST_PREFIX}-rowad.moazez.school`,
        contactEmail: `${TEST_PREFIX}-rowad-admin@example.test`,
        userType: 'school_user',
        status: 'active',
        mustChangePassword: true,
      },
      credentials: {
        deliveryMode: 'manual',
        status: 'manual_pending',
        temporaryPassword: null,
      },
      deferred: {
        entitlements: 'deferred',
        featureControl: 'deferred',
        studentSeatLimit: 'deferred',
        billing: 'out_of_scope_v1',
      },
    });
    expectSanitized(manualProvisioning);

    await expectProvisionedState(manualProvisioning, {
      expectedPasswordHash: null,
    });
  });

  it('provisions a school under an existing organization using activation_link mode', async () => {
    const organization = await prisma.organization.create({
      data: {
        name: `${TEST_PREFIX} Existing Group`,
        slug: `${TEST_PREFIX}-existing-group`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    existingOrganizationId = organization.id;
    createdOrganizationIds.push(organization.id);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/platform-admin/school-provisioning`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        provisioningPayload({
          organization: {
            mode: 'existing',
            organizationId: existingOrganizationId,
          },
          school: {
            name: `${TEST_PREFIX} Existing Campus`,
            slug: 'campus',
          },
          loginDomain: `${TEST_PREFIX}-existing.moazez.school`,
          username: 'primary.admin',
          contactEmail: `${TEST_PREFIX}-existing-admin@example.test`,
          deliveryMode: 'activation_link',
        }),
      )
      .expect(201);

    activationProvisioning = response.body;
    trackProvisioning(activationProvisioning, {
      organizationAlreadyTracked: true,
    });

    expect(activationProvisioning).toMatchObject({
      provisioningId: activationProvisioning.school.schoolId,
      organization: {
        organizationId: existingOrganizationId,
        slug: `${TEST_PREFIX}-existing-group`,
        status: OrganizationStatus.ACTIVE,
      },
      school: {
        organizationId: existingOrganizationId,
        slug: 'campus',
        status: SchoolStatus.ACTIVE,
      },
      loginIdentity: {
        loginDomain: `${TEST_PREFIX}-existing.moazez.school`,
        primaryAdminLoginEmail: `primary.admin@${TEST_PREFIX}-existing.moazez.school`,
      },
      primaryAdmin: {
        username: 'primary.admin',
        loginEmail: `primary.admin@${TEST_PREFIX}-existing.moazez.school`,
        userType: 'school_user',
        status: 'active',
        mustChangePassword: true,
      },
      credentials: {
        deliveryMode: 'activation_link',
        status: 'activation_link_deferred',
        temporaryPassword: null,
      },
    });
    expectSanitized(activationProvisioning);

    await expectProvisionedState(activationProvisioning, {
      expectedPasswordHash: null,
    });
  });

  it('rejects duplicate organization slug', async () => {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/platform-admin/school-provisioning`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        provisioningPayload({
          organization: {
            mode: 'create',
            name: `${TEST_PREFIX} Duplicate Rowad`,
            slug: manualProvisioning.organization.slug,
          },
          school: {
            name: `${TEST_PREFIX} Duplicate Rowad School`,
            slug: 'main',
          },
          loginDomain: `${TEST_PREFIX}-duplicate-org.moazez.school`,
          username: 'duplicate.admin',
          contactEmail: `${TEST_PREFIX}-duplicate-org-admin@example.test`,
          deliveryMode: 'manual',
        }),
      )
      .expect(409);

    expect(response.body?.error?.code).toBe('platform.organization.slug_taken');
  });

  it('rejects duplicate school slug under the same organization', async () => {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/platform-admin/school-provisioning`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        provisioningPayload({
          organization: {
            mode: 'existing',
            organizationId: manualProvisioning.organization.organizationId,
          },
          school: {
            name: `${TEST_PREFIX} Duplicate School Slug`,
            slug: manualProvisioning.school.slug,
          },
          loginDomain: `${TEST_PREFIX}-duplicate-school.moazez.school`,
          username: 'slug.admin',
          contactEmail: `${TEST_PREFIX}-duplicate-school-admin@example.test`,
          deliveryMode: 'manual',
        }),
      )
      .expect(409);

    expect(response.body?.error?.code).toBe('platform.school.slug_taken');
  });

  it('rejects duplicate login domain', async () => {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/platform-admin/school-provisioning`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        provisioningPayload({
          organization: {
            mode: 'existing',
            organizationId: existingOrganizationId,
          },
          school: {
            name: `${TEST_PREFIX} Duplicate Domain`,
            slug: 'duplicate-domain',
          },
          loginDomain: manualProvisioning.loginIdentity.loginDomain,
          username: 'domain.admin',
          contactEmail: `${TEST_PREFIX}-duplicate-domain-admin@example.test`,
          deliveryMode: 'manual',
        }),
      )
      .expect(409);

    expect(response.body?.error?.code).toBe(
      'platform.school_provisioning.login_domain_taken',
    );
  });

  it('rejects duplicate primary admin login email', async () => {
    const duplicateLoginDomain = `${TEST_PREFIX}-login-taken.moazez.school`;
    const duplicateLoginEmail = `admin@${duplicateLoginDomain}`;
    const existingUser = await prisma.user.create({
      data: {
        email: duplicateLoginEmail,
        firstName: 'Existing',
        lastName: 'Admin',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdUserIds.push(existingUser.id);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/platform-admin/school-provisioning`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        provisioningPayload({
          organization: {
            mode: 'existing',
            organizationId: existingOrganizationId,
          },
          school: {
            name: `${TEST_PREFIX} Login Taken`,
            slug: 'login-taken',
          },
          loginDomain: duplicateLoginDomain,
          username: 'admin',
          contactEmail: `${TEST_PREFIX}-login-taken-admin@example.test`,
          deliveryMode: 'manual',
        }),
      )
      .expect(409);

    expect(response.body?.error?.code).toBe(
      'platform.school_provisioning.primary_admin_login_taken',
    );
  });

  it('rejects archived organizations without partial provisioning', async () => {
    const archived = await prisma.organization.create({
      data: {
        name: `${TEST_PREFIX} Archived Group`,
        slug: `${TEST_PREFIX}-archived-group`,
        status: OrganizationStatus.ARCHIVED,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(archived.id);

    const beforeSchools = await prisma.school.count({
      where: { organizationId: archived.id },
    });
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/platform-admin/school-provisioning`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(
        provisioningPayload({
          organization: {
            mode: 'existing',
            organizationId: archived.id,
          },
          school: {
            name: `${TEST_PREFIX} Archived Should Not Exist`,
            slug: 'archived-school',
          },
          loginDomain: `${TEST_PREFIX}-archived.moazez.school`,
          username: 'archived.admin',
          contactEmail: `${TEST_PREFIX}-archived-admin@example.test`,
          deliveryMode: 'manual',
        }),
      )
      .expect(409);

    expect(response.body?.error?.code).toBe('platform.organization.archived');
    await expect(
      prisma.school.count({ where: { organizationId: archived.id } }),
    ).resolves.toBe(beforeSchools);
  });

  it('audits provisioning actions with sanitized metadata', async () => {
    const logs = await prisma.auditLog.findMany({
      where: {
        actorId: platformUserId,
        module: 'platform_admin',
        outcome: AuditOutcome.SUCCESS,
        schoolId: {
          in: [
            manualProvisioning.school.schoolId,
            activationProvisioning.school.schoolId,
          ],
        },
      },
      select: {
        action: true,
        resourceType: true,
        resourceId: true,
        organizationId: true,
        schoolId: true,
        before: true,
        after: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    expect(logs.map((log) => log.action)).toEqual(
      expect.arrayContaining([
        'platform.school_provisioning.school.create',
        'platform.school_provisioning.login_identity.configure',
        'platform.school_provisioning.primary_admin.create',
        'platform.school_provisioning.membership.create',
        'platform.school_provisioning.credentials.provision',
      ]),
    );
    const organizationSelectLog = await prisma.auditLog.findFirst({
      where: {
        actorId: platformUserId,
        module: 'platform_admin',
        action: 'platform.school_provisioning.organization.select',
        organizationId: activationProvisioning.organization.organizationId,
      },
      select: { after: true },
    });
    expect(organizationSelectLog).toBeTruthy();

    const organizationCreateLog = await prisma.auditLog.findFirst({
      where: {
        actorId: platformUserId,
        module: 'platform_admin',
        action: 'platform.school_provisioning.organization.create',
        organizationId: manualProvisioning.organization.organizationId,
      },
      select: { after: true },
    });
    expect(organizationCreateLog).toBeTruthy();

    const serialized = JSON.stringify({
      logs,
      organizationCreateLog,
      organizationSelectLog,
    });
    for (const forbidden of [
      'passwordHash',
      'temporaryPassword',
      'token',
      'tokenHash',
      'encryptedPassword',
      'encryptedApiKey',
      'smtp-secret',
      manualProvisioning.primaryAdmin.contactEmail,
      activationProvisioning.primaryAdmin.contactEmail,
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('does not create subscription, feature-control, billing surfaces, or provisioning entitlements', async () => {
    const routes = listRegisteredRoutes();
    for (const route of [
      'features',
      'entitlements',
      'subscriptions',
      'billing',
      'invoices',
      'audit-logs',
    ]) {
      expect(routes).not.toContain(`GET /api/v1/platform-admin/${route}`);
      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/platform-admin/${route}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    }

    const deferredTables = await prisma.$queryRaw<
      Array<{ table_name: string }>
    >`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'school_subscriptions',
          'school_feature_entitlements',
          'platform_billing',
          'billing',
          'invoices'
        )
    `;
    expect(deferredTables).toEqual([]);

    await expect(
      prisma.schoolEntitlement.count({
        where: { schoolId: { in: createdSchoolIds } },
      }),
    ).resolves.toBe(0);
  });

  async function expectProvisionedState(
    provisioning: ProvisioningResponse,
    options: { expectedPasswordHash: string | null },
  ): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: provisioning.primaryAdmin.userId },
      select: {
        id: true,
        email: true,
        username: true,
        contactEmail: true,
        passwordHash: true,
        userType: true,
        status: true,
        mustChangePassword: true,
      },
    });
    expect(user).toMatchObject({
      id: provisioning.primaryAdmin.userId,
      email: provisioning.primaryAdmin.loginEmail,
      username: provisioning.primaryAdmin.username,
      contactEmail: provisioning.primaryAdmin.contactEmail,
      passwordHash: options.expectedPasswordHash,
      userType: UserType.SCHOOL_USER,
      status: UserStatus.ACTIVE,
      mustChangePassword: true,
    });

    const membership = await prisma.membership.findFirstOrThrow({
      where: {
        userId: provisioning.primaryAdmin.userId,
        organizationId: provisioning.organization.organizationId,
        schoolId: provisioning.school.schoolId,
        status: MembershipStatus.ACTIVE,
      },
      include: {
        role: {
          select: {
            key: true,
            name: true,
          },
        },
      },
    });
    expect(membership.userType).toBe(UserType.SCHOOL_USER);
    expect(membership.role.key).toBe('school_admin');

    const loginSettings = await prisma.schoolLoginSettings.findUniqueOrThrow({
      where: { schoolId: provisioning.school.schoolId },
      select: {
        loginDomain: true,
        status: true,
      },
    });
    expect(loginSettings).toEqual({
      loginDomain: provisioning.loginIdentity.loginDomain,
      status: SchoolLoginSettingsStatus.ACTIVE,
    });
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

  function provisioningPayload(input: {
    organization:
      | { mode: 'create'; name: string; slug: string }
      | { mode: 'existing'; organizationId: string };
    school: { name: string; slug: string };
    loginDomain: string;
    username: string;
    contactEmail: string;
    deliveryMode: 'activation_link' | 'manual';
  }) {
    return {
      organization: input.organization,
      school: input.school,
      loginIdentity: {
        loginDomain: input.loginDomain,
      },
      primaryAdmin: {
        firstName: 'School',
        lastName: 'Admin',
        username: input.username,
        contactEmail: input.contactEmail,
        phone: `+201${hashSuffix(input.loginDomain).slice(0, 9)}`,
      },
      credentials: {
        deliveryMode: input.deliveryMode,
      },
    };
  }

  function hashSuffix(value: string): string {
    const hash = [...value].reduce(
      (current, char) => current + char.charCodeAt(0),
      0,
    );
    return String(hash).padEnd(9, '0');
  }

  function trackProvisioning(
    provisioning: ProvisioningResponse,
    options?: { organizationAlreadyTracked?: boolean },
  ): void {
    if (!options?.organizationAlreadyTracked) {
      createdOrganizationIds.push(provisioning.organization.organizationId);
    }
    createdSchoolIds.push(provisioning.school.schoolId);
    createdUserIds.push(provisioning.primaryAdmin.userId);
  }

  function expectSanitized(value: unknown): void {
    const serialized = JSON.stringify(value);
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
