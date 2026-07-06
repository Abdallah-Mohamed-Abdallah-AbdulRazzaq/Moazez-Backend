import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DismissalGateOperationalStatus,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import 'reflect-metadata';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../src/common/guards/permissions.guard';
import { ScopeResolverGuard } from '../../src/common/guards/scope-resolver.guard';
import { SCHOOL_SCOPED_MODELS } from '../../src/infrastructure/database/school-scope.extension';
import { DismissalGatesController } from '../../src/modules/dismissal/gates/controller/dismissal-gates.controller';
import { DismissalSettingsController } from '../../src/modules/dismissal/settings/controller/dismissal-settings.controller';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'DismissalCoreSecurity123!';
const TEST_RUN_ID = randomUUID().slice(0, 8);
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type ControllerClass = {
  name: string;
  prototype: object;
};

const ROUTE_PERMISSION_CASES = [
  {
    controller: DismissalSettingsController,
    method: 'getSettings',
    permissions: ['dismissal.settings.view'],
  },
  {
    controller: DismissalSettingsController,
    method: 'updateSettings',
    permissions: ['dismissal.settings.manage'],
  },
  {
    controller: DismissalGatesController,
    method: 'listGates',
    permissions: ['dismissal.gates.view'],
  },
  {
    controller: DismissalGatesController,
    method: 'createGate',
    permissions: ['dismissal.gates.manage'],
  },
  {
    controller: DismissalGatesController,
    method: 'getGate',
    permissions: ['dismissal.gates.view'],
  },
  {
    controller: DismissalGatesController,
    method: 'updateGate',
    permissions: ['dismissal.gates.manage'],
  },
] as const;

const CONTROLLERS = [DismissalSettingsController, DismissalGatesController];

jest.setTimeout(60_000);

describe('DISMISSAL-CORE-1A route metadata and deferred surface guards', () => {
  it('declares exact RequiredPermissions metadata on every settings/gates route', () => {
    for (const entry of ROUTE_PERMISSION_CASES) {
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSIONS_METADATA,
          getControllerHandler(entry.controller, entry.method),
        ),
      ).toEqual(entry.permissions);
    }
  });

  it('declares the required JwtAuth, ScopeResolver, Permissions guard chain', () => {
    for (const controller of CONTROLLERS) {
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
        JwtAuthGuard,
        ScopeResolverGuard,
        PermissionsGuard,
      ]);
    }
  });

  it('registers dismissal models in the school-scope extension', () => {
    expect(SCHOOL_SCOPED_MODELS.has('DismissalSettings')).toBe(true);
    expect(SCHOOL_SCOPED_MODELS.has('DismissalGate')).toBe(true);
  });

  it('does not add deferred pickup/shift/device-token schema or routes', () => {
    const schemaSource = readFileSync('prisma/schema.prisma', 'utf8');
    expect(schemaSource).not.toMatch(/model\s+DismissalShift\b/);

    const tokenSurfaceBlock = schemaSource.match(
      /enum AppDeviceTokenSurface \{([\s\S]*?)\n\}/,
    )?.[1];
    expect(tokenSurfaceBlock).toBeTruthy();
    expect(tokenSurfaceBlock).toContain('DISMISSAL_STAFF');
  });
});

describe('DISMISSAL-CORE-1A tenancy and RBAC (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationAId: string;
  let organizationBId: string;
  let schoolAId: string;
  let schoolBId: string;
  let adminAToken: string;
  let dismissalStaffAToken: string;
  let noPermissionToken: string;
  let gateAId: string;
  let gateBId: string;
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [schoolAdminRole, dismissalStaffRole] = await Promise.all([
      prisma.role.findFirst({
        where: { key: 'school_admin', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.role.findFirst({
        where: { key: 'dismissal_staff', schoolId: null, isSystem: true },
        select: { id: true },
      }),
    ]);
    if (!schoolAdminRole || !dismissalStaffRole) {
      throw new Error(
        'Required system roles not found - run `npm run seed` before tests.',
      );
    }

    const fixtureA = await createSchoolFixture('a');
    const fixtureB = await createSchoolFixture('b');
    schoolAId = fixtureA.schoolId;
    schoolBId = fixtureB.schoolId;
    organizationAId = fixtureA.organizationId;
    organizationBId = fixtureB.organizationId;

    const noPermissionRole = await prisma.role.create({
      data: {
        schoolId: schoolAId,
        key: `dismissal-core-empty-${TEST_RUN_ID}`,
        name: 'Dismissal Core Empty Role',
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(noPermissionRole.id);

    const adminA = await createUserWithMembership({
      email: `dismissal-core-sec-${TEST_RUN_ID}-admin-a@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
    });
    const dismissalStaffA = await createUserWithMembership({
      email: `dismissal-core-sec-${TEST_RUN_ID}-staff-a@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
    });
    const noPermissionUser = await createUserWithMembership({
      email: `dismissal-core-sec-${TEST_RUN_ID}-noperm@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: noPermissionRole.id,
      userType: UserType.SCHOOL_USER,
    });

    gateAId = await createGateFixture({
      schoolId: schoolAId,
      code: `SEC-A-${TEST_RUN_ID}`,
      name: 'Security Gate A',
      status: DismissalGateOperationalStatus.OPEN,
    });
    gateBId = await createGateFixture({
      schoolId: schoolBId,
      code: `SEC-B-${TEST_RUN_ID}`,
      name: 'Security Gate B',
      status: DismissalGateOperationalStatus.CLOSED,
    });

    await prisma.dismissalSettings.create({
      data: {
        schoolId: schoolBId,
        enabled: true,
        timezone: 'Europe/Berlin',
        schoolLatitude: 52.5,
        schoolLongitude: 13.4,
        defaultGateId: gateBId,
      },
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

    adminAToken = await login(adminA.email);
    dismissalStaffAToken = await login(dismissalStaffA.email);
    noPermissionToken = await login(noPermissionUser.email);
  });

  afterAll(async () => {
    if (prisma) {
      const schoolIds = [schoolAId, schoolBId].filter(Boolean);
      await prisma.dismissalSettings.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.dismissalGate.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { actorId: { in: createdUserIds } },
            { schoolId: { in: schoolIds } },
          ],
          module: 'dismissal',
        },
      });
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: createdRoleIds } },
      });
      await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
      await prisma.school.deleteMany({
        where: { id: { in: createdSchoolIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrganizationIds } },
      });
      await prisma.$disconnect();
    }
    if (app) await app.close();
  });

  it('rejects unauthenticated requests to every dismissal settings/gates route', async () => {
    const randomId = randomUUID();
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/settings`)
      .expect(401);
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/settings`)
      .send({ enabled: false })
      .expect(401);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/gates`)
      .expect(401);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/gates`)
      .send({ code: 'NOAUTH', name: 'No Auth' })
      .expect(401);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/gates/${randomId}`)
      .expect(401);
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/gates/${randomId}`)
      .send({ status: 'open' })
      .expect(401);
  });

  it('forbids authenticated users without dismissal permissions', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/settings`)
      .set('Authorization', `Bearer ${noPermissionToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/gates`)
      .set('Authorization', `Bearer ${noPermissionToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/gates`)
      .set('Authorization', `Bearer ${noPermissionToken}`)
      .send({ code: 'NOPERM', name: 'No Permission Gate' })
      .expect(403);
  });

  it('allows school admin to manage settings and gates through SCHOOL_LEVEL permissions', async () => {
    const settings = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/settings`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        enabled: true,
        schoolLatitude: 30.1,
        schoolLongitude: 31.2,
        defaultGateId: gateAId,
      })
      .expect(200);
    expect(settings.body.defaultGate.id).toBe(gateAId);
    assertNoDismissalLeak(settings.body);

    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/gates`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ code: `ADMIN-${TEST_RUN_ID}`, name: 'Admin Managed Gate' })
      .expect(201);

    const patched = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/gates/${created.body.id}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ status: 'busy' })
      .expect(200);

    expect(patched.body.status).toBe('busy');
    assertNoDismissalLeak(patched.body);
  });

  it('allows DISMISSAL_STAFF to view gates but not settings or gate mutations', async () => {
    const gates = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/gates`)
      .set('Authorization', `Bearer ${dismissalStaffAToken}`)
      .expect(200);
    expect(JSON.stringify(gates.body)).toContain(gateAId);
    assertNoDismissalLeak(gates.body);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/settings`)
      .set('Authorization', `Bearer ${dismissalStaffAToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/gates`)
      .set('Authorization', `Bearer ${dismissalStaffAToken}`)
      .send({ code: 'STAFF-MUTATE', name: 'Staff Mutate Gate' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/gates/${gateAId}`)
      .set('Authorization', `Bearer ${dismissalStaffAToken}`)
      .send({ status: 'closed' })
      .expect(403);
  });

  it('returns safe 404 for cross-school gate/default-gate access and never reads school B settings', async () => {
    const gateRead = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/gates/${gateBId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(404);
    expect(gateRead.body?.error?.code).toBe('dismissal.gate.not_found');

    const gatePatch = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/gates/${gateBId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ status: 'open' })
      .expect(404);
    expect(gatePatch.body?.error?.code).toBe('dismissal.gate.not_found');

    const settingsPatch = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/settings`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ defaultGateId: gateBId })
      .expect(404);
    expect(settingsPatch.body?.error?.code).toBe(
      'dismissal.settings.default_gate_not_found',
    );

    const settingsRead = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/settings`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
    expect(JSON.stringify(settingsRead.body)).not.toContain('Europe/Berlin');
    expect(JSON.stringify(settingsRead.body)).not.toContain(gateBId);
    assertNoDismissalLeak(settingsRead.body);
  });

  it('does not expose forbidden root/app routes for deferred dismissal runtime', async () => {
    await request(app.getHttpServer()).get(`${GLOBAL_PREFIX}/pickup`).expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/waiting-students`)
      .expect(404);
  });

  async function createSchoolFixture(label: string): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `dismissal-core-sec-${TEST_RUN_ID}-org-${label}`,
        name: `Dismissal Core Security Org ${label}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `dismissal-core-sec-${TEST_RUN_ID}-school-${label}`,
        name: `Dismissal Core Security School ${label}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createUserWithMembership(params: {
    email: string;
    schoolId: string;
    organizationId: string;
    roleId: string;
    userType: UserType;
  }): Promise<{ email: string; userId: string }> {
    const passwordHash = await argon2.hash(PASSWORD, ARGON2_OPTIONS);
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: 'Dismissal',
        lastName: 'Security',
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash,
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

    return { email: params.email, userId: user.id };
  }

  async function createGateFixture(params: {
    schoolId: string;
    code: string;
    name: string;
    status: DismissalGateOperationalStatus;
  }): Promise<string> {
    const gate = await prisma.dismissalGate.create({
      data: {
        schoolId: params.schoolId,
        code: params.code,
        name: params.name,
        status: params.status,
      },
      select: { id: true },
    });

    return gate.id;
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return response.body.accessToken as string;
  }
});

function getControllerHandler(
  controller: ControllerClass,
  method: string,
): object {
  const handler = (controller.prototype as Record<string, unknown>)[method];
  if (typeof handler !== 'function') {
    throw new Error(`${controller.name}.${method} handler not found.`);
  }

  return handler;
}

function assertNoDismissalLeak(body: unknown): void {
  const serialized = JSON.stringify(body);
  for (const forbidden of [
    'schoolId',
    'updatedById',
    'deletedAt',
    'actorId',
    'membershipId',
    'roleId',
    'organizationId',
    'updated_by_id',
    'school_id',
    'deleted_at',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}
