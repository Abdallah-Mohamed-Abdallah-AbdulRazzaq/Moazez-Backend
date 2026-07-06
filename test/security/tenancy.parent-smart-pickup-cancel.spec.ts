import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DismissalGateOperationalStatus,
  DismissalRequestEventType,
  DismissalRequestStatus,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolStatus,
  StudentEnrollmentStatus,
  StudentStatus,
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
import { ParentSmartPickupController } from '../../src/modules/parent-app/smart-pickup/controller/parent-smart-pickup.controller';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'ParentCancelSecurity123!';
const TEST_RUN_ID = randomUUID().slice(0, 8);
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(90_000);

describe('PARENT-DISMISSAL-1C route metadata and seed boundaries', () => {
  it('declares exact RequiredPermissions metadata for recent-calls and cancel routes', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        ParentSmartPickupController.prototype.listRecentCalls,
      ),
    ).toEqual(['parent.smart_pickup.view']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        ParentSmartPickupController.prototype.cancelRequest,
      ),
    ).toEqual(['parent.smart_pickup.cancel']);
  });

  it('keeps the existing JwtAuth, ScopeResolver, Permissions guard chain', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ParentSmartPickupController)).toEqual([
      JwtAuthGuard,
      ScopeResolverGuard,
      PermissionsGuard,
    ]);
  });

  it('adds only parent.smart_pickup.cancel to the Parent role boundary', () => {
    const permissionsSeed = readFileSync(
      `${process.cwd()}/prisma/seeds/01-permissions.seed.ts`,
      'utf8',
    );
    const rolesSeed = readFileSync(
      `${process.cwd()}/prisma/seeds/02-system-roles.seed.ts`,
      'utf8',
    );
    const parentPermissions = extractConstStringArray(
      rolesSeed,
      'PARENT_PERMISSIONS',
    );
    const teacherPermissions = extractConstStringArray(
      rolesSeed,
      'TEACHER_PERMISSIONS',
    );
    const studentPermissions = extractConstStringArray(
      rolesSeed,
      'STUDENT_PERMISSIONS',
    );
    const dismissalStaffPermissions = extractConstStringArray(
      rolesSeed,
      'DISMISSAL_STAFF_PERMISSIONS',
    );

    expect(permissionsSeed).toContain("code: 'parent.smart_pickup.cancel'");
    expect(permissionsSeed).toContain("module: 'parent'");
    expect(permissionsSeed).toContain("resource: 'smart_pickup'");
    expect(permissionsSeed).toContain("action: 'cancel'");
    expect(permissionsSeed).toContain(
      'Cancel Parent App smart pickup requests before school-side processing starts',
    );
    expect(parentPermissions).toHaveLength(46);
    expect(parentPermissions).toContain('parent.smart_pickup.view');
    expect(parentPermissions).toContain('parent.smart_pickup.request');
    expect(parentPermissions).toContain('parent.smart_pickup.cancel');
    expect(parentPermissions.some((code) => code.startsWith('dismissal.'))).toBe(
      false,
    );

    for (const permissions of [
      teacherPermissions,
      studentPermissions,
      dismissalStaffPermissions,
    ]) {
      expect(permissions).not.toContain('parent.smart_pickup.cancel');
    }
  });

  it('keeps schema and migration scope closed for recent-calls/cancel', () => {
    const schemaSource = readFileSync('prisma/schema.prisma', 'utf8');
    expect(schemaSource).toMatch(/model\s+DismissalRequest\b/);
    expect(schemaSource).not.toMatch(/model\s+ParentSmartPickupCancel\b/);
    expect(schemaSource).not.toMatch(/model\s+DismissalCancellation\b/);
    expect(schemaSource).not.toMatch(/model\s+DismissalRecentCall\b/);

    const tokenSurfaceBlock = schemaSource.match(
      /enum AppDeviceTokenSurface \{([\s\S]*?)\n\}/,
    )?.[1];
    expect(tokenSurfaceBlock).toBeTruthy();
    expect(tokenSurfaceBlock).toContain('DISMISSAL_STAFF');

    const migrationNames = readdirSync('prisma/migrations');
    expect(
      migrationNames.some((name) =>
        name.includes('parent_dismissal_1c') ||
        name.includes('recent_calls') ||
        name.includes('parent_cancel'),
      ),
    ).toBe(false);
  });
});

describe('PARENT-DISMISSAL-1C tenancy and RBAC (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationAId: string;
  let schoolAId: string;
  let parentId: string;
  let guardianId: string;
  let classroomId: string;
  let gateId: string;
  let parentToken: string;
  let noViewToken: string;
  let noCancelToken: string;
  let nonParentWithPermissionToken: string;
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [parentRole, viewPermission, cancelPermission] = await Promise.all([
      prisma.role.findFirst({
        where: { key: 'parent', schoolId: null, isSystem: true },
        select: {
          id: true,
          rolePermissions: {
            select: { permission: { select: { code: true } } },
          },
        },
      }),
      prisma.permission.findUnique({
        where: { code: 'parent.smart_pickup.view' },
        select: { id: true },
      }),
      prisma.permission.findUnique({
        where: { code: 'parent.smart_pickup.cancel' },
        select: { id: true },
      }),
    ]);
    if (!parentRole || !viewPermission || !cancelPermission) {
      throw new Error(
        'Parent Smart Pickup permissions not found - run `npm run seed`.',
      );
    }
    const parentRolePermissionCodes = parentRole.rolePermissions.map(
      (rolePermission) => rolePermission.permission.code,
    );
    expect(parentRolePermissionCodes).toContain('parent.smart_pickup.view');
    expect(parentRolePermissionCodes).toContain('parent.smart_pickup.request');
    expect(parentRolePermissionCodes).toContain('parent.smart_pickup.cancel');
    expect(parentRolePermissionCodes.some((code) => code.startsWith('dismissal.'))).toBe(
      false,
    );

    const fixture = await createSchoolFixture();
    organizationAId = fixture.organizationId;
    schoolAId = fixture.schoolId;
    classroomId = (await createAcademicFixture()).classroomId;
    gateId = await createGate();

    const noViewRole = await createRole({
      key: `parent-cancel-no-view-${TEST_RUN_ID}`,
      permissions: [cancelPermission.id],
    });
    const noCancelRole = await createRole({
      key: `parent-cancel-no-cancel-${TEST_RUN_ID}`,
      permissions: [viewPermission.id],
    });
    const bothPermissionsRole = await createRole({
      key: `parent-cancel-both-${TEST_RUN_ID}`,
      permissions: [viewPermission.id, cancelPermission.id],
    });

    const parent = await createUserWithMembership({
      email: `parent-cancel-sec-${TEST_RUN_ID}@moazez.local`,
      roleId: parentRole.id,
      userType: UserType.PARENT,
    });
    parentId = parent.userId;
    const noViewParent = await createUserWithMembership({
      email: `parent-cancel-sec-${TEST_RUN_ID}-no-view@moazez.local`,
      roleId: noViewRole,
      userType: UserType.PARENT,
    });
    const noCancelParent = await createUserWithMembership({
      email: `parent-cancel-sec-${TEST_RUN_ID}-no-cancel@moazez.local`,
      roleId: noCancelRole,
      userType: UserType.PARENT,
    });
    const nonParentWithPermission = await createUserWithMembership({
      email: `parent-cancel-sec-${TEST_RUN_ID}-school-user@moazez.local`,
      roleId: bothPermissionsRole,
      userType: UserType.SCHOOL_USER,
    });

    guardianId = await createGuardian(parentId);
    await prisma.dismissalSettings.create({
      data: {
        schoolId: schoolAId,
        enabled: true,
        timezone: 'Africa/Cairo',
        schoolLatitude: 30.04442,
        schoolLongitude: 31.235712,
        requestWindowStartLocal: '00:00',
        requestWindowEndLocal: '23:59',
        requirePickupCode: false,
        allowParentCancelBeforeCalled: true,
        defaultGateId: gateId,
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

    parentToken = await login(parent.email);
    noViewToken = await login(noViewParent.email);
    noCancelToken = await login(noCancelParent.email);
    nonParentWithPermissionToken = await login(nonParentWithPermission.email);
  });

  beforeEach(async () => {
    await prisma.dismissalRequestEvent.deleteMany({ where: { schoolId: schoolAId } });
    await prisma.dismissalRequest.deleteMany({ where: { schoolId: schoolAId } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.auditLog.deleteMany({ where: { schoolId: schoolAId } });
      await prisma.dismissalRequestEvent.deleteMany({
        where: { schoolId: schoolAId },
      });
      await prisma.dismissalRequest.deleteMany({ where: { schoolId: schoolAId } });
      await prisma.dismissalSettings.deleteMany({ where: { schoolId: schoolAId } });
      await prisma.dismissalGate.deleteMany({ where: { schoolId: schoolAId } });
      await prisma.studentGuardian.deleteMany({ where: { schoolId: schoolAId } });
      await prisma.enrollment.deleteMany({ where: { schoolId: schoolAId } });
      await prisma.guardian.deleteMany({ where: { schoolId: schoolAId } });
      await prisma.student.deleteMany({ where: { schoolId: schoolAId } });
      await prisma.classroom.deleteMany({ where: { schoolId: schoolAId } });
      await prisma.section.deleteMany({ where: { schoolId: schoolAId } });
      await prisma.grade.deleteMany({ where: { schoolId: schoolAId } });
      await prisma.stage.deleteMany({ where: { schoolId: schoolAId } });
      await prisma.term.deleteMany({ where: { schoolId: schoolAId } });
      await prisma.academicYear.deleteMany({ where: { schoolId: schoolAId } });
      await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.rolePermission.deleteMany({
        where: { roleId: { in: createdRoleIds } },
      });
      await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
      await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrganizationIds } },
      });
      await prisma.$disconnect();
    }
    if (app) await app.close();
  });

  it('rejects unauthenticated recent-calls and cancel requests', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup/recent-calls`)
      .expect(401);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests/${randomUUID()}/cancel`)
      .send({})
      .expect(401);
  });

  it('forbids authenticated parents without exact route permissions', async () => {
    const requestId = await createRequest(DismissalRequestStatus.REQUESTED);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup/recent-calls`)
      .set('Authorization', `Bearer ${noViewToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests/${requestId}/cancel`)
      .set('Authorization', `Bearer ${noCancelToken}`)
      .send({})
      .expect(403);
  });

  it('rejects non-parent actors even when they carry the route permissions', async () => {
    const requestId = await createRequest(DismissalRequestStatus.REQUESTED);

    const listResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup/recent-calls`)
      .set('Authorization', `Bearer ${nonParentWithPermissionToken}`)
      .expect(403);
    expect(listResponse.body?.error?.code).toBe(
      'parent.smart_pickup.invalid_actor_type',
    );

    const cancelResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests/${requestId}/cancel`)
      .set('Authorization', `Bearer ${nonParentWithPermissionToken}`)
      .send({})
      .expect(403);
    expect(cancelResponse.body?.error?.code).toBe(
      'parent.smart_pickup.invalid_actor_type',
    );
  });

  it('serves owned recent-calls and cancellation without raw pickup-code fields', async () => {
    const requestId = await createRequest(DismissalRequestStatus.REQUESTED);

    const listResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup/recent-calls`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(200);
    expect(listResponse.body.data.map((item: { id: string }) => item.id)).toContain(
      requestId,
    );
    assertNoPickupCodeLeak(listResponse.body);

    const cancelResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/parent/smart-pickup/requests/${requestId}/cancel`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({})
      .expect(201);
    expect(cancelResponse.body.request).toMatchObject({
      id: requestId,
      status: 'cancelled',
      changed: true,
    });
    assertNoPickupCodeLeak(cancelResponse.body);
  });

  it('keeps forbidden deferred/root routes absent', async () => {
    const id = randomUUID();
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${id}/call`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${id}/ready`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/requests/${id}/escalate`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/waiting-students/${id}/ready`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/waiting-students/${id}/deliver`)
      .set('Authorization', `Bearer ${parentToken}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer()).get(`${GLOBAL_PREFIX}/pickup`).expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/waiting-students`)
      .expect(404);
  });

  async function createSchoolFixture(): Promise<{
    organizationId: string;
    schoolId: string;
  }> {
    const organization = await prisma.organization.create({
      data: {
        slug: `parent-cancel-sec-${TEST_RUN_ID}-org`,
        name: `Parent Cancel Security Org ${TEST_RUN_ID}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `parent-cancel-sec-${TEST_RUN_ID}-school`,
        name: `Parent Cancel Security School ${TEST_RUN_ID}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createRole(params: {
    key: string;
    permissions: string[];
  }): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId: schoolAId,
        key: params.key,
        name: params.key,
        isSystem: false,
        rolePermissions: {
          create: params.permissions.map((permissionId) => ({ permissionId })),
        },
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);
    return role.id;
  }

  async function createAcademicFixture(): Promise<{ classroomId: string }> {
    const year = await prisma.academicYear.create({
      data: {
        schoolId: schoolAId,
        nameAr: `cancel-sec-year-${TEST_RUN_ID}-ar`,
        nameEn: `Cancel Security Year ${TEST_RUN_ID}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-06-30T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const term = await prisma.term.create({
      data: {
        schoolId: schoolAId,
        academicYearId: year.id,
        nameAr: `cancel-sec-term-${TEST_RUN_ID}-ar`,
        nameEn: `Cancel Security Term ${TEST_RUN_ID}`,
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-01-31T00:00:00.000Z'),
        isActive: true,
      },
      select: { id: true },
    });
    const stage = await prisma.stage.create({
      data: {
        schoolId: schoolAId,
        nameAr: `cancel-sec-stage-${TEST_RUN_ID}-ar`,
        nameEn: `Cancel Security Stage ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId: schoolAId,
        stageId: stage.id,
        nameAr: `cancel-sec-grade-${TEST_RUN_ID}-ar`,
        nameEn: `Cancel Security Grade ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const section = await prisma.section.create({
      data: {
        schoolId: schoolAId,
        gradeId: grade.id,
        nameAr: `cancel-sec-section-${TEST_RUN_ID}-ar`,
        nameEn: `Cancel Security Section ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: schoolAId,
        sectionId: section.id,
        nameAr: `cancel-sec-classroom-${TEST_RUN_ID}-ar`,
        nameEn: `Cancel Security Classroom ${TEST_RUN_ID}`,
      },
      select: { id: true },
    });

    void term;
    return { classroomId: classroom.id };
  }

  async function createGate(): Promise<string> {
    const gate = await prisma.dismissalGate.create({
      data: {
        schoolId: schoolAId,
        code: `PCAN-SEC-${TEST_RUN_ID}`,
        name: 'Parent Cancel Security Gate',
        status: DismissalGateOperationalStatus.OPEN,
        isActive: true,
      },
      select: { id: true },
    });
    return gate.id;
  }

  async function createUserWithMembership(params: {
    email: string;
    roleId: string;
    userType: UserType;
  }): Promise<{ userId: string; email: string }> {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        username: params.email,
        firstName: 'Cancel',
        lastName: 'Security',
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
        memberships: {
          create: {
            schoolId: schoolAId,
            organizationId: organizationAId,
            roleId: params.roleId,
            status: MembershipStatus.ACTIVE,
            userType: params.userType,
          },
        },
      },
      select: { id: true, email: true },
    });
    createdUserIds.push(user.id);
    return { userId: user.id, email: user.email };
  }

  async function createGuardian(userId: string): Promise<string> {
    const guardian = await prisma.guardian.create({
      data: {
        schoolId: schoolAId,
        organizationId: organizationAId,
        userId,
        firstName: 'Cancel',
        lastName: 'Security Guardian',
        relation: 'parent',
        phone: `${TEST_RUN_ID}-security`,
        isPrimary: true,
        canPickup: true,
        canReceiveNotifications: true,
      },
      select: { id: true },
    });
    return guardian.id;
  }

  async function createRequest(status: DismissalRequestStatus): Promise<string> {
    const year = await prisma.academicYear.findFirstOrThrow({
      where: { schoolId: schoolAId },
      select: { id: true },
    });
    const term = await prisma.term.findFirstOrThrow({
      where: { schoolId: schoolAId },
      select: { id: true },
    });
    const student = await prisma.student.create({
      data: {
        schoolId: schoolAId,
        organizationId: organizationAId,
        firstName: 'Cancel',
        lastName: 'Request',
        status: StudentStatus.ACTIVE,
      },
      select: { id: true },
    });
    await prisma.studentGuardian.create({
      data: {
        schoolId: schoolAId,
        studentId: student.id,
        guardianId,
        isPrimary: true,
      },
    });
    const enrollment = await prisma.enrollment.create({
      data: {
        schoolId: schoolAId,
        studentId: student.id,
        academicYearId: year.id,
        termId: term.id,
        classroomId,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    const dismissalRequest = await prisma.dismissalRequest.create({
      data: {
        schoolId: schoolAId,
        studentId: student.id,
        enrollmentId: enrollment.id,
        guardianId,
        requestedById: parentId,
        gateId,
        status,
        parentLatitude: 30.04442,
        parentLongitude: 31.235712,
        distanceMeters: 0,
        geofencePassed: true,
      },
      select: { id: true },
    });
    await prisma.dismissalRequestEvent.create({
      data: {
        schoolId: schoolAId,
        requestId: dismissalRequest.id,
        type: DismissalRequestEventType.REQUEST_CREATED,
        actorUserId: parentId,
        statusTo: DismissalRequestStatus.REQUESTED,
      },
    });
    return dismissalRequest.id;
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return response.body.accessToken as string;
  }
});

function extractConstStringArray(source: string, constName: string): string[] {
  const match = source.match(
    new RegExp(`const ${constName} = \\[([\\s\\S]*?)\\];`),
  );
  expect(match).not.toBeNull();

  return [...match![1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

function assertNoPickupCodeLeak(body: unknown): void {
  assertNoExactKey(body, 'pickupCode');
  expect(JSON.stringify(body)).not.toContain('pickupCodeHash');
  expect(JSON.stringify(body)).not.toContain('pickupCodeSalt');
}

function assertNoExactKey(body: unknown, forbiddenKey: string): void {
  visit(body);

  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      expect(key).not.toBe(forbiddenKey);
      visit(child);
    }
  }
}
