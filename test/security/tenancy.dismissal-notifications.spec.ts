import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CommunicationNotificationDeliveryChannel,
  CommunicationNotificationSourceModule,
  CommunicationNotificationType,
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
import { DismissalNotificationsController } from '../../src/modules/dismissal/notifications/controller/dismissal-notifications.controller';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'DismissalNotificationsSecurity123!';
const TEST_RUN_ID = randomUUID().slice(0, 8);
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(120_000);

describe('DISMISSAL-NOTIFICATIONS-1A route metadata and boundaries', () => {
  it('declares exact RequiredPermissions metadata for notification routes', () => {
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
  });

  it('declares the required JwtAuth, ScopeResolver, Permissions guard chain', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, DismissalNotificationsController),
    ).toEqual([JwtAuthGuard, ScopeResolverGuard, PermissionsGuard]);
  });

  it('uses existing dismissal notification permissions without role leakage or seed changes', () => {
    const rolesSeed = readFileSync(
      `${process.cwd()}/prisma/seeds/02-system-roles.seed.ts`,
      'utf8',
    );
    const permissionsSeed = readFileSync(
      `${process.cwd()}/prisma/seeds/01-permissions.seed.ts`,
      'utf8',
    );
    const dismissalStaffPermissions = extractConstStringArray(
      rolesSeed,
      'DISMISSAL_STAFF_PERMISSIONS',
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

    expect(permissionsSeed).toContain("code: 'dismissal.notifications.view'");
    expect(permissionsSeed).toContain("code: 'dismissal.notifications.manage'");
    expect(dismissalStaffPermissions).toEqual(
      expect.arrayContaining([
        'dismissal.notifications.view',
        'dismissal.notifications.manage',
      ]),
    );
    expect(parentPermissions).not.toContain('dismissal.notifications.view');
    expect(parentPermissions).not.toContain('dismissal.notifications.manage');
    expect(teacherPermissions).not.toContain('dismissal.notifications.view');
    expect(studentPermissions).not.toContain('dismissal.notifications.view');
    expect(dismissalStaffPermissions.some((code) => code.startsWith('communication.'))).toBe(false);
  });

  it('adds only Dismissal notification enum values and no device-token/push/realtime surface', () => {
    const schemaSource = readFileSync('prisma/schema.prisma', 'utf8');
    const migrationSource = readFileSync(
      'prisma/migrations/20260710135222_baseline_v1/migration.sql',
      'utf8',
    );

    for (const value of [
      'DISMISSAL_REQUEST_CREATED',
      'DISMISSAL_REQUEST_CANCELLED',
      'DISMISSAL_REQUEST_CALLED',
      'DISMISSAL_REQUEST_READY',
      'DISMISSAL_REQUEST_HANDED_OVER',
    ]) {
      expect(schemaSource).toContain(value);
      expect(migrationSource).toContain(value);
    }
    expect(migrationSource).toContain('communication_notification_type');
    expect(migrationSource).toContain('communication_notification_source_module');

    const tokenSurfaceBlock = schemaSource.match(
      /enum AppDeviceTokenSurface \{([\s\S]*?)\n\}/,
    )?.[1];
    expect(tokenSurfaceBlock).toBeTruthy();
    expect(tokenSurfaceBlock).toContain('DISMISSAL_STAFF');
  });
});

describe('DISMISSAL-NOTIFICATIONS-1A tenancy and RBAC (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationId: string;
  let schoolId: string;
  let staffUserId: string;
  let noPermissionToken: string;
  let viewOnlyToken: string;
  let staffToken: string;
  let parentToken: string;
  const createdUserIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdOrganizationIds: string[] = [];
  const createdRoleIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [dismissalStaffRole, parentRole] = await Promise.all([
      prisma.role.findFirst({
        where: { key: 'dismissal_staff', schoolId: null, isSystem: true },
        select: { id: true },
      }),
      prisma.role.findFirst({
        where: { key: 'parent', schoolId: null, isSystem: true },
        select: { id: true },
      }),
    ]);
    if (!dismissalStaffRole || !parentRole) {
      throw new Error('Required system roles not found - run `npm run seed`.');
    }

    const fixture = await createSchoolFixture();
    organizationId = fixture.organizationId;
    schoolId = fixture.schoolId;

    const noPermissionRole = await createRole('no-perm', []);
    const viewOnlyRole = await createRole('view-only', [
      'dismissal.notifications.view',
    ]);

    const noPermission = await createUserWithMembership({
      email: `dismissal-notif-sec-${TEST_RUN_ID}-noperm@moazez.local`,
      roleId: noPermissionRole,
      userType: UserType.SCHOOL_USER,
      firstName: 'No',
      lastName: 'Permission',
    });
    const viewOnly = await createUserWithMembership({
      email: `dismissal-notif-sec-${TEST_RUN_ID}-view@moazez.local`,
      roleId: viewOnlyRole,
      userType: UserType.SCHOOL_USER,
      firstName: 'View',
      lastName: 'Only',
    });
    const staff = await createUserWithMembership({
      email: `dismissal-notif-sec-${TEST_RUN_ID}-staff@moazez.local`,
      roleId: dismissalStaffRole.id,
      userType: UserType.DISMISSAL_STAFF,
      firstName: 'Dismissal',
      lastName: 'Staff',
    });
    const parent = await createUserWithMembership({
      email: `dismissal-notif-sec-${TEST_RUN_ID}-parent@moazez.local`,
      roleId: parentRole.id,
      userType: UserType.PARENT,
      firstName: 'Parent',
      lastName: 'User',
    });
    staffUserId = staff.userId;

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

    noPermissionToken = await login(noPermission.email);
    viewOnlyToken = await login(viewOnly.email);
    staffToken = await login(staff.email);
    parentToken = await login(parent.email);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.communicationNotificationPushAttempt.deleteMany({
        where: { schoolId },
      });
      await prisma.communicationNotificationDelivery.deleteMany({
        where: { schoolId },
      });
      await prisma.communicationNotification.deleteMany({ where: { schoolId } });
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

  it('rejects unauthenticated and unauthorized notification requests', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/notifications`)
      .expect(401);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/notifications`)
      .set('Authorization', `Bearer ${noPermissionToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/notifications`)
      .set('Authorization', `Bearer ${parentToken}`)
      .expect(403);
  });

  it('allows view permission to list and requires manage permission for read mutations', async () => {
    const notificationId = await createNotification(staffUserId);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/notifications`)
      .set('Authorization', `Bearer ${viewOnlyToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${viewOnlyToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/notifications/read-all`)
      .set('Authorization', `Bearer ${viewOnlyToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
  });

  it('does not expose forbidden root, push, or realtime routes', async () => {
    await request(app.getHttpServer()).get(`${GLOBAL_PREFIX}/notifications`).expect(404);
    await request(app.getHttpServer()).get(`${GLOBAL_PREFIX}/pickup`).expect(404);
    await request(app.getHttpServer()).get(`${GLOBAL_PREFIX}/waiting-students`).expect(404);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/device-tokens`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/realtime`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(404);

    await expect(
      prisma.communicationNotificationPushAttempt.count({ where: { schoolId } }),
    ).resolves.toBe(0);
  });

  async function createSchoolFixture() {
    const organization = await prisma.organization.create({
      data: {
        slug: `dismissal-notif-sec-${TEST_RUN_ID}-org`,
        name: `Dismissal Notification Security Org ${TEST_RUN_ID}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId: organization.id,
        slug: `dismissal-notif-sec-${TEST_RUN_ID}-school`,
        name: `Dismissal Notification Security School ${TEST_RUN_ID}`,
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
        key: `dismissal-notif-${marker}-${TEST_RUN_ID}`,
        name: `Dismissal Notification ${marker}`,
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

  async function createNotification(recipientUserId: string): Promise<string> {
    const notification = await prisma.communicationNotification.create({
      data: {
        schoolId,
        recipientUserId,
        sourceModule: CommunicationNotificationSourceModule.DISMISSAL,
        sourceType: 'dismissal_request',
        sourceId: randomUUID(),
        idempotencyKey: `security:${TEST_RUN_ID}:${recipientUserId}`,
        type: CommunicationNotificationType.DISMISSAL_REQUEST_CREATED,
        title: 'New pickup request',
        body: 'A pickup request was created.',
        metadata: {
          request: { id: randomUUID(), status: 'requested' },
          child: {
            id: randomUUID(),
            displayName: 'Security Child',
            grade: null,
            section: null,
            classroom: null,
          },
          gate: { id: randomUUID(), code: 'SEC', name: 'Security Gate' },
        },
      },
      select: { id: true },
    });
    await prisma.communicationNotificationDelivery.create({
      data: {
        schoolId,
        notificationId: notification.id,
        channel: CommunicationNotificationDeliveryChannel.IN_APP,
        status: 'DELIVERED',
        provider: 'in_app',
        deliveredAt: new Date(),
      },
    });
    return notification.id;
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
