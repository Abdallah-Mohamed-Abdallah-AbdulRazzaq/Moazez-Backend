import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AppDeviceTokenSurface,
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
import { FIREBASE_PUSH_FORBIDDEN_DATA_KEYS } from '../../src/infrastructure/push/firebase/firebase-push.provider';
import { DismissalNotificationsController } from '../../src/modules/dismissal/notifications/controller/dismissal-notifications.controller';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'DismissalPushSecurity123!';
const TEST_RUN_ID = randomUUID().slice(0, 8);
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(120_000);

describe('DISMISSAL-NOTIFICATIONS-1B push/device-token security metadata', () => {
  it('declares exact permissions for Dismissal notification and token routes', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        DismissalNotificationsController.prototype.listNotifications,
      ),
    ).toEqual(['dismissal.notifications.view']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        DismissalNotificationsController.prototype.markRead,
      ),
    ).toEqual(['dismissal.notifications.manage']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        DismissalNotificationsController.prototype.markAllRead,
      ),
    ).toEqual(['dismissal.notifications.manage']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        DismissalNotificationsController.prototype.registerDeviceToken,
      ),
    ).toEqual(['app.device_tokens.manage']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        DismissalNotificationsController.prototype.unregisterCurrentDeviceToken,
      ),
    ).toEqual(['app.device_tokens.manage']);
  });

  it('uses the required guard chain on the controller', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, DismissalNotificationsController),
    ).toEqual([JwtAuthGuard, ScopeResolverGuard, PermissionsGuard]);
  });

  it('enables only the Dismissal Staff device-token surface with existing permission seed', () => {
    const schemaSource = readFileSync('prisma/schema.prisma', 'utf8');
    const migrationSource = readFileSync(
      'prisma/migrations/20260710135222_baseline_v1/migration.sql',
      'utf8',
    );
    const rolesSeed = readFileSync(
      'src/modules/iam/reference-data/system-role-catalog.ts',
      'utf8',
    );
    const permissionsSeed = readFileSync(
      'src/modules/iam/reference-data/permission-catalog.ts',
      'utf8',
    );

    expect(Object.values(AppDeviceTokenSurface)).toContain('DISMISSAL_STAFF');
    expect(schemaSource).toMatch(
      /enum AppDeviceTokenSurface \{[\s\S]*DISMISSAL_STAFF/,
    );
    expect(migrationSource).toMatch(
      /CREATE TYPE "app_device_token_surface" AS ENUM \([^;]*'DISMISSAL_STAFF'/,
    );
    expect(permissionsSeed.match(/app\.device_tokens\.manage/g) ?? []).toHaveLength(
      1,
    );
    expect(extractConstStringArray(rolesSeed, 'DISMISSAL_STAFF_PERMISSIONS')).toEqual(
      expect.arrayContaining(['app.device_tokens.manage']),
    );
    expect(rolesSeed).not.toContain('dismissal.push');
    expect(rolesSeed).not.toContain('parent.smart_pickup.notifications');
  });

  it('keeps forbidden Dismissal keys blocked at the Firebase payload boundary', () => {
    expect(FIREBASE_PUSH_FORBIDDEN_DATA_KEYS).toEqual(
      expect.arrayContaining([
        'pickupCode',
        'pickupRecipientToken',
        'guardianId',
        'studentGuardianId',
        'requestedById',
        'staffUserId',
        'parentLatitude',
        'parentLongitude',
        'distanceMeters',
        'geofencePassed',
        'clientRequestId',
        'schoolId',
        'organizationId',
        'token',
        'tokenHash',
        'tokenCiphertext',
      ]),
    );
  });
});

describe('DISMISSAL-NOTIFICATIONS-1B push/device-token route security', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationId: string;
  let schoolId: string;
  let staffToken: string;
  let noPermissionToken: string;
  let parentToken: string;
  let teacherToken: string;
  let studentToken: string;
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [dismissalStaffRole, parentRole, teacherRole, studentRole] =
      await Promise.all([
        findSystemRole('dismissal_staff'),
        findSystemRole('parent'),
        findSystemRole('teacher'),
        findSystemRole('student'),
      ]);

    const fixture = await createSchoolFixture();
    organizationId = fixture.organizationId;
    schoolId = fixture.schoolId;

    const noPermissionRoleId = await createRole('no-token-permission', []);

    const staff = await createUserWithMembership({
      email: `dismissal-push-sec-${TEST_RUN_ID}-staff@moazez.local`,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Push',
      lastName: 'Staff',
    });
    const noPermission = await createUserWithMembership({
      email: `dismissal-push-sec-${TEST_RUN_ID}-noperm@moazez.local`,
      roleId: noPermissionRoleId,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'No',
      lastName: 'Permission',
    });
    const parent = await createUserWithMembership({
      email: `dismissal-push-sec-${TEST_RUN_ID}-parent@moazez.local`,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Push',
      lastName: 'Parent',
    });
    const teacher = await createUserWithMembership({
      email: `dismissal-push-sec-${TEST_RUN_ID}-teacher@moazez.local`,
      roleId: teacherRole.id,
      userType: UserType.TEACHER,
      firstName: 'Push',
      lastName: 'Teacher',
    });
    const student = await createUserWithMembership({
      email: `dismissal-push-sec-${TEST_RUN_ID}-student@moazez.local`,
      roleId: studentRole.id,
      userType: UserType.STUDENT,
      firstName: 'Push',
      lastName: 'Student',
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

    staffToken = await login(staff.email);
    noPermissionToken = await login(noPermission.email);
    parentToken = await login(parent.email);
    teacherToken = await login(teacher.email);
    studentToken = await login(student.email);
  });

  afterAll(async () => {
    try {
      await prisma.appDeviceToken.deleteMany({ where: { schoolId } });
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
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  });

  it('rejects unauthenticated, no-permission, and non-staff token registration', async () => {
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/notifications/device-tokens`)
      .send(registerTokenBody('unauthenticated-token'))
      .expect(401);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/notifications/device-tokens`)
      .set('Authorization', `Bearer ${noPermissionToken}`)
      .send(registerTokenBody('no-permission-token'))
      .expect(403);

    for (const token of [parentToken, teacherToken, studentToken]) {
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/dismissal/notifications/device-tokens`)
        .set('Authorization', `Bearer ${token}`)
        .send(registerTokenBody(`invalid-actor-${randomUUID()}`))
        .expect(403)
        .expect((response) => {
          expect(JSON.stringify(response.body)).toContain(
            'dismissal.notification.invalid_actor_type',
          );
        });
    }
  });

  it('registers and unregisters only safe Dismissal Staff token responses', async () => {
    const rawToken = `staff-security-token-${TEST_RUN_ID}`;
    const registered = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/notifications/device-tokens`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send(registerTokenBody(rawToken))
      .expect(201);

    expect(registered.body).toMatchObject({
      deviceTokenId: expect.any(String),
      appSurface: 'dismissal_staff',
      platform: 'ios',
      isActive: true,
    });
    expect(JSON.stringify(registered.body)).not.toContain(rawToken);
    expect(JSON.stringify(registered.body)).not.toContain('tokenHash');
    expect(JSON.stringify(registered.body)).not.toContain('tokenCiphertext');

    const unregistered = await request(app.getHttpServer())
      .delete(`${GLOBAL_PREFIX}/dismissal/notifications/device-tokens/current`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ token: rawToken })
      .expect(200);

    expect(unregistered.body).toMatchObject({
      deviceTokenId: registered.body.deviceTokenId,
      appSurface: 'dismissal_staff',
      revoked: true,
    });
    expect(JSON.stringify(unregistered.body)).not.toContain(rawToken);
  });

  it('does not expose public push-send, test-provider, or Smart Pickup notification routes', async () => {
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/device-tokens`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send(registerTokenBody('wrong-route-token'))
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/notifications/push/send`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/push/test`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/parent/smart-pickup/notifications`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(404);
    await request(app.getHttpServer()).get(`${GLOBAL_PREFIX}/pickup`).expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/waiting-students`)
      .expect(404);
  });

  async function createSchoolFixture() {
    const organization = await prisma.organization.create({
      data: {
        slug: `dismissal-push-sec-${TEST_RUN_ID}-org`,
        name: `Dismissal Push Security Org ${TEST_RUN_ID}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `dismissal-push-sec-${TEST_RUN_ID}-school`,
        name: `Dismissal Push Security School ${TEST_RUN_ID}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdSchoolIds.push(school.id);

    return { organizationId: organization.id, schoolId: school.id };
  }

  async function createRole(
    marker: string,
    permissionCodes: string[],
  ): Promise<string> {
    const role = await prisma.role.create({
      data: {
        schoolId,
        key: `dismissal-push-${marker}-${TEST_RUN_ID}`,
        name: `Dismissal Push ${marker}`,
        isSystem: false,
      },
      select: { id: true },
    });
    createdRoleIds.push(role.id);

    for (const code of permissionCodes) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { code },
        select: { id: true },
      });
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId: permission.id },
      });
    }

    return role.id;
  }

  async function createUserWithMembership(params: {
    email: string;
    roleId: string;
    userType: UserType;
    firstName: string;
    lastName: string;
  }) {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        username: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
        memberships: {
          create: {
            schoolId,
            organizationId,
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

  async function findSystemRole(key: string): Promise<{ id: string }> {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!role) throw new Error(`${key} system role not found - run seed.`);
    return role;
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return response.body.accessToken as string;
  }
});

function registerTokenBody(token: string) {
  return {
    token,
    platform: 'ios',
    deviceId: `device-${token}`,
  };
}

function extractConstStringArray(source: string, constName: string): string[] {
  const match = source.match(
    new RegExp(`const ${constName} = \\[([\\s\\S]*?)\\];`),
  );
  expect(match).not.toBeNull();

  return [...match![1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}
