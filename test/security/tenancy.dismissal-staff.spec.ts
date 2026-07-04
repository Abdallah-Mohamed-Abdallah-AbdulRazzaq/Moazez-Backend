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
import { DismissalProfileController } from '../../src/modules/dismissal/profile/controller/dismissal-profile.controller';
import { DismissalStaffAssignmentsController } from '../../src/modules/dismissal/staff-assignments/controller/dismissal-staff-assignments.controller';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'DismissalStaffSecurity123!';
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
    controller: DismissalProfileController,
    method: 'getProfile',
    permissions: ['dismissal.profile.view'],
  },
  {
    controller: DismissalStaffAssignmentsController,
    method: 'listAssignments',
    permissions: ['dismissal.staff.view'],
  },
  {
    controller: DismissalStaffAssignmentsController,
    method: 'createAssignment',
    permissions: ['dismissal.staff.manage'],
  },
  {
    controller: DismissalStaffAssignmentsController,
    method: 'getAssignment',
    permissions: ['dismissal.staff.view'],
  },
  {
    controller: DismissalStaffAssignmentsController,
    method: 'updateAssignment',
    permissions: ['dismissal.staff.manage'],
  },
  {
    controller: DismissalStaffAssignmentsController,
    method: 'deleteAssignment',
    permissions: ['dismissal.staff.manage'],
  },
] as const;

const CONTROLLERS = [
  DismissalProfileController,
  DismissalStaffAssignmentsController,
];

jest.setTimeout(90_000);

describe('DISMISSAL-STAFF-1A route metadata and deferred surface guards', () => {
  it('declares exact RequiredPermissions metadata on every new route', () => {
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

  it('registers DismissalStaffAssignment in the school-scope extension', () => {
    expect(SCHOOL_SCOPED_MODELS.has('DismissalStaffAssignment')).toBe(true);
  });

  it('does not add deferred request/shift/device-token schema', () => {
    const schemaSource = readFileSync('prisma/schema.prisma', 'utf8');
    expect(schemaSource).toMatch(/model\s+DismissalStaffAssignment\b/);
    expect(schemaSource).not.toMatch(/model\s+DismissalRequest\b/);
    expect(schemaSource).not.toMatch(/model\s+DismissalShift\b/);
    expect(schemaSource).not.toMatch(/model\s+DismissalShiftAssignment\b/);

    const tokenSurfaceBlock = schemaSource.match(
      /enum AppDeviceTokenSurface \{([\s\S]*?)\n\}/,
    )?.[1];
    expect(tokenSurfaceBlock).toBeTruthy();
    expect(tokenSurfaceBlock).not.toContain('DISMISSAL_STAFF');
  });
});

describe('DISMISSAL-STAFF-1A tenancy and RBAC (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationAId: string;
  let organizationBId: string;
  let schoolAId: string;
  let schoolBId: string;
  let adminAToken: string;
  let dismissalStaffAToken: string;
  let noPermissionToken: string;
  let staffAId: string;
  let gateAId: string;
  let secondaryGateAId: string;
  let gateBId: string;
  let assignmentAId: string;
  let assignmentBId: string;
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
      throw new Error('Required system roles not found - run `npm run seed`.');
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
        key: `dismissal-staff-empty-${TEST_RUN_ID}`,
        name: 'Dismissal Staff Empty Role',
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(noPermissionRole.id);

    const adminA = await createUserWithMembership({
      email: `dismissal-staff-sec-${TEST_RUN_ID}-admin-a@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: schoolAdminRole.id,
      userType: UserType.SCHOOL_USER,
    });
    const dismissalStaffA = await createUserWithMembership({
      email: `dismissal-staff-sec-${TEST_RUN_ID}-staff-a@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
    });
    staffAId = dismissalStaffA.userId;
    const dismissalStaffB = await createUserWithMembership({
      email: `dismissal-staff-sec-${TEST_RUN_ID}-staff-b@moazez.local`,
      schoolId: schoolBId,
      organizationId: organizationBId,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
    });
    const noPermissionUser = await createUserWithMembership({
      email: `dismissal-staff-sec-${TEST_RUN_ID}-noperm@moazez.local`,
      schoolId: schoolAId,
      organizationId: organizationAId,
      roleId: noPermissionRole.id,
      userType: UserType.SCHOOL_USER,
    });

    gateAId = await createGateFixture({
      schoolId: schoolAId,
      code: `STAFF-SEC-A-${TEST_RUN_ID}`,
      name: 'Staff Security Gate A',
      status: DismissalGateOperationalStatus.OPEN,
    });
    secondaryGateAId = await createGateFixture({
      schoolId: schoolAId,
      code: `STAFF-SEC-A2-${TEST_RUN_ID}`,
      name: 'Staff Security Gate A2',
      status: DismissalGateOperationalStatus.BUSY,
    });
    gateBId = await createGateFixture({
      schoolId: schoolBId,
      code: `STAFF-SEC-B-${TEST_RUN_ID}`,
      name: 'Staff Security Gate B',
      status: DismissalGateOperationalStatus.CLOSED,
    });

    assignmentAId = (
      await prisma.dismissalStaffAssignment.create({
        data: {
          schoolId: schoolAId,
          staffUserId: staffAId,
          gateId: gateAId,
          isActive: true,
        },
        select: { id: true },
      })
    ).id;
    assignmentBId = (
      await prisma.dismissalStaffAssignment.create({
        data: {
          schoolId: schoolBId,
          staffUserId: dismissalStaffB.userId,
          gateId: gateBId,
          isActive: true,
        },
        select: { id: true },
      })
    ).id;

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
      await prisma.dismissalStaffAssignment.deleteMany({
        where: { schoolId: { in: schoolIds } },
      });
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
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
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

  it('rejects unauthenticated requests to every new route', async () => {
    const randomId = randomUUID();
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/profile`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/staff-assignments`)
      .expect(401);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/staff-assignments`)
      .send({ staffUserId: staffAId, gateId: gateAId })
      .expect(401);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/staff-assignments/${randomId}`)
      .expect(401);
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/staff-assignments/${randomId}`)
      .send({ isLead: true })
      .expect(401);
    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/dismissal/staff-assignments/${randomId}`)
      .expect(401);
  });

  it('forbids authenticated users without dismissal staff permissions', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/profile`)
      .set('Authorization', `Bearer ${noPermissionToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/staff-assignments`)
      .set('Authorization', `Bearer ${noPermissionToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/staff-assignments`)
      .set('Authorization', `Bearer ${noPermissionToken}`)
      .send({ staffUserId: staffAId, gateId: gateAId })
      .expect(403);
  });

  it('allows school admin to manage assignments', async () => {
    const created = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/staff-assignments`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ staffUserId: staffAId, gateId: secondaryGateAId })
      .expect(201);
    assertNoDismissalLeak(created.body);

    const patched = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/staff-assignments/${created.body.id}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ isLead: true })
      .expect(200);
    expect(patched.body.isLead).toBe(true);
    assertNoDismissalLeak(patched.body);

    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/dismissal/staff-assignments/${created.body.id}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);
  });

  it('allows DISMISSAL_STAFF to view own profile but not manage assignments or settings/gates', async () => {
    const profile = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/profile`)
      .set('Authorization', `Bearer ${dismissalStaffAToken}`)
      .expect(200);
    expect(profile.body.readiness.hasAssignments).toBe(true);
    assertNoDismissalLeak(profile.body);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/staff-assignments`)
      .set('Authorization', `Bearer ${dismissalStaffAToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/staff-assignments`)
      .set('Authorization', `Bearer ${dismissalStaffAToken}`)
      .send({ staffUserId: staffAId, gateId: gateAId })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/staff-assignments/${assignmentAId}`)
      .set('Authorization', `Bearer ${dismissalStaffAToken}`)
      .send({ isLead: true })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/dismissal/staff-assignments/${assignmentAId}`)
      .set('Authorization', `Bearer ${dismissalStaffAToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/settings`)
      .set('Authorization', `Bearer ${dismissalStaffAToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/gates`)
      .set('Authorization', `Bearer ${dismissalStaffAToken}`)
      .send({ code: `DENY-${TEST_RUN_ID}`, name: 'Denied Gate' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/gates/${gateAId}`)
      .set('Authorization', `Bearer ${dismissalStaffAToken}`)
      .send({ status: 'closed' })
      .expect(403);
  });

  it('returns safe 404 for cross-school assignment reads and mutations', async () => {
    const read = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/staff-assignments/${assignmentBId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(404);
    expect(read.body?.error?.code).toBe('dismissal.staff_assignment.not_found');

    const patch = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/staff-assignments/${assignmentBId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({ isLead: true })
      .expect(404);
    expect(patch.body?.error?.code).toBe('dismissal.staff_assignment.not_found');

    const deleted = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/dismissal/staff-assignments/${assignmentBId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(404);
    expect(deleted.body?.error?.code).toBe(
      'dismissal.staff_assignment.not_found',
    );
  });

  it('does not expose forbidden deferred routes', async () => {
    await request(app.getHttpServer()).get(`${GLOBAL_PREFIX}/pickup`).expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/waiting-students`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup/recent-calls`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests/${randomUUID()}/cancel`)
      .expect(404);
  });

  it('does not create request or shift tables in the database', async () => {
    const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'dismissal_requests',
          'dismissal_request_events',
          'dismissal_shifts',
          'dismissal_shift_assignments'
        )
    `;
    expect(rows).toEqual([]);
  });

  async function createSchoolFixture(label: string): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `dismissal-staff-sec-${TEST_RUN_ID}-org-${label}`,
        name: `Dismissal Staff Security Org ${label}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `dismissal-staff-sec-${TEST_RUN_ID}-school-${label}`,
        name: `Dismissal Staff Security School ${label}`,
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
    'staffUserId',
    'createdById',
    'updatedById',
    'deletedAt',
    'organizationId',
    'membershipId',
    'roleId',
    'actorId',
    'school_id',
    'staff_user_id',
    'created_by_id',
    'updated_by_id',
    'deleted_at',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}
