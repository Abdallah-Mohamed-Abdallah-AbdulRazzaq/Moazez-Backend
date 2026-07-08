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
const ADMIN_PASSWORD = 'SettingsDismissalAdmin123!';
const STAFF_PASSWORD = 'SettingsDismissalStaff123!';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

const EXPECTED_DISMISSAL_STAFF_PERMISSIONS = [
  'app.device_tokens.manage',
  'dismissal.profile.view',
  'dismissal.gates.view',
  'dismissal.requests.view',
  'dismissal.requests.manage',
  'dismissal.requests.deliver',
  'dismissal.requests.escalate',
  'dismissal.requests.history.view',
  'dismissal.notifications.view',
  'dismissal.notifications.manage',
] as const;

const EXPECTED_VISIBLE_DISMISSAL_PERMISSIONS = [
  'dismissal.profile.view',
  'dismissal.settings.view',
  'dismissal.settings.manage',
  'dismissal.gates.view',
  'dismissal.gates.manage',
  'dismissal.staff.view',
  'dismissal.staff.manage',
  'dismissal.requests.view',
  'dismissal.requests.manage',
  'dismissal.requests.deliver',
  'dismissal.requests.escalate',
  'dismissal.requests.history.view',
  'dismissal.notifications.view',
  'dismissal.notifications.manage',
] as const;

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

type RoleResponse = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  memberCount: number;
  permissions: string[];
};

jest.setTimeout(120_000);

describe('Settings Dismissal Staff role integration (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationId = '';
  let schoolId = '';
  let schoolAdminRoleId = '';
  let dismissalStaffRoleId = '';
  let adminEmail = '';
  let adminTokens: AuthTokens;
  let createdStaffUserId = '';
  let invitedStaffUserId = '';
  let updatedStaffUserId = '';
  const createdUserIds: string[] = [];
  const createdRoleIds: string[] = [];
  const suffix = randomUUID().slice(0, 8);
  const marker = `settings-dismissal-${suffix}`;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const [schoolAdminRole, dismissalStaffRole] = await Promise.all([
      findSystemRole('school_admin'),
      findSystemRole('dismissal_staff'),
    ]);
    schoolAdminRoleId = schoolAdminRole.id;
    dismissalStaffRoleId = dismissalStaffRole.id;

    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org`,
        name: `Settings Dismissal Org ${suffix}`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationId = organization.id;

    const school = await prisma.school.create({
      data: {
        organizationId,
        slug: `${marker}-school`,
        name: `Settings Dismissal School ${suffix}`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolId = school.id;

    await prisma.schoolProfile.create({
      data: {
        schoolId,
        schoolName: `Settings Dismissal School ${suffix}`,
        timezone: 'Africa/Cairo',
      },
    });

    adminEmail = `${marker}-admin@example.test`;
    await createUserWithMembership({
      email: adminEmail,
      password: ADMIN_PASSWORD,
      firstName: 'Settings',
      lastName: 'Admin',
      roleId: schoolAdminRoleId,
      userType: UserType.SCHOOL_USER,
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

    adminTokens = await login(adminEmail, ADMIN_PASSWORD);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) {
      const allCreatedUserIds = [
        ...createdUserIds,
        createdStaffUserId,
        invitedStaffUserId,
        updatedStaffUserId,
      ].filter((id, index, values): id is string => Boolean(id) && values.indexOf(id) === index);

      if (allCreatedUserIds.length > 0) {
        await prisma.session.deleteMany({
          where: { userId: { in: allCreatedUserIds } },
        });
        await prisma.membership.deleteMany({
          where: { userId: { in: allCreatedUserIds } },
        });
        await prisma.auditLog.deleteMany({
          where: {
            OR: [
              { actorId: { in: allCreatedUserIds } },
              { resourceId: { in: allCreatedUserIds } },
            ],
          },
        });
        await prisma.user.deleteMany({
          where: { id: { in: allCreatedUserIds } },
        });
      }
      if (createdRoleIds.length > 0) {
        await prisma.rolePermission.deleteMany({
          where: { roleId: { in: createdRoleIds } },
        });
        await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
      }
      if (schoolId) {
        await prisma.auditLog.deleteMany({ where: { schoolId } });
        await prisma.schoolProfile.deleteMany({ where: { schoolId } });
        await prisma.school.deleteMany({ where: { id: schoolId } });
      }
      if (organizationId) {
        await prisma.auditLog.deleteMany({ where: { organizationId } });
        await prisma.organization.deleteMany({ where: { id: organizationId } });
      }
      await prisma.$disconnect();
    }
  });

  it('shows Dismissal Staff in Settings roles with the approved operational permissions', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/roles`)
      .set('Authorization', bearer(adminTokens))
      .expect(200);

    const roles = response.body as RoleResponse[];
    const dismissalStaffRole = roles.find(
      (role) => role.name === 'Dismissal Staff' && role.isSystem,
    );

    expect(dismissalStaffRole).toBeTruthy();
    expect(dismissalStaffRole?.id).toBe(dismissalStaffRoleId);
    expect(dismissalStaffRole?.permissions).toEqual(
      expect.arrayContaining([...EXPECTED_DISMISSAL_STAFF_PERMISSIONS]),
    );
    expect(dismissalStaffRole?.permissions.sort()).toEqual(
      [...EXPECTED_DISMISSAL_STAFF_PERMISSIONS].sort(),
    );
    assertNoSettingsLeak(response.body);
  });

  it('shows Dismissal permissions and device-token permission in Settings permissions', async () => {
    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/permissions`)
      .set('Authorization', bearer(adminTokens))
      .expect(200);

    const permissionCodes = response.body.map(
      (permission: { key: string }) => permission.key,
    );

    expect(permissionCodes).toEqual(
      expect.arrayContaining([
        ...EXPECTED_VISIBLE_DISMISSAL_PERMISSIONS,
        'app.device_tokens.manage',
      ]),
    );
    assertNoSettingsLeak(response.body);
  });

  it('creates an active Settings user as DISMISSAL_STAFF when Dismissal Staff role is assigned', async () => {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/users`)
      .set('Authorization', bearer(adminTokens))
      .send({
        fullName: 'Created Dismissal Staff',
        email: `${marker}-created-staff@example.test`,
        roleId: dismissalStaffRoleId,
      })
      .expect(201);

    createdStaffUserId = response.body.id;
    expect(response.body).toEqual(
      expect.objectContaining({
        id: createdStaffUserId,
        fullName: 'Created Dismissal Staff',
        roleId: dismissalStaffRoleId,
        roleName: 'Dismissal Staff',
        status: 'active',
      }),
    );
    assertNoSettingsLeak(response.body);

    await expectUserAndMembershipType(
      createdStaffUserId,
      UserType.DISMISSAL_STAFF,
    );
  });

  it('invites a Settings user as DISMISSAL_STAFF when Dismissal Staff role is assigned', async () => {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/users/invite`)
      .set('Authorization', bearer(adminTokens))
      .send({
        fullName: 'Invited Dismissal Staff',
        email: `${marker}-invited-staff@example.test`,
        roleId: dismissalStaffRoleId,
      })
      .expect(201);

    invitedStaffUserId = response.body.id;
    expect(response.body).toEqual(
      expect.objectContaining({
        id: invitedStaffUserId,
        fullName: 'Invited Dismissal Staff',
        roleId: dismissalStaffRoleId,
        roleName: 'Dismissal Staff',
        status: 'invited',
      }),
    );
    assertNoSettingsLeak(response.body);

    await expectUserAndMembershipType(
      invitedStaffUserId,
      UserType.DISMISSAL_STAFF,
    );
  });

  it('updates an existing Settings user to DISMISSAL_STAFF when Dismissal Staff role is assigned', async () => {
    const initial = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/users`)
      .set('Authorization', bearer(adminTokens))
      .send({
        fullName: 'Role Update Target',
        email: `${marker}-update-target@example.test`,
        roleId: schoolAdminRoleId,
      })
      .expect(201);
    updatedStaffUserId = initial.body.id;

    await expectUserAndMembershipType(updatedStaffUserId, UserType.SCHOOL_USER);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/settings/users/${updatedStaffUserId}`)
      .set('Authorization', bearer(adminTokens))
      .send({
        roleId: dismissalStaffRoleId,
        fullName: 'Updated Dismissal Staff',
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: updatedStaffUserId,
        fullName: 'Updated Dismissal Staff',
        roleId: dismissalStaffRoleId,
        roleName: 'Dismissal Staff',
        status: 'active',
      }),
    );
    assertNoSettingsLeak(response.body);

    await expectUserAndMembershipType(
      updatedStaffUserId,
      UserType.DISMISSAL_STAFF,
    );
  });

  it('created Dismissal Staff can use the Dismissal profile but not Settings or Dismissal management', async () => {
    await prisma.user.update({
      where: { id: createdStaffUserId },
      data: {
        passwordHash: await argon2.hash(STAFF_PASSWORD, ARGON2_OPTIONS),
      },
    });

    const staffTokens = await login(
      `${marker}-created-staff@example.test`,
      STAFF_PASSWORD,
    );

    const profile = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/dismissal/profile`)
      .set('Authorization', bearer(staffTokens))
      .expect(200);

    expect(profile.body.profile).toEqual(
      expect.objectContaining({
        displayName: 'Created Dismissal Staff',
        userType: 'dismissal_staff',
        status: 'active',
      }),
    );
    expect(profile.body.readiness).toEqual(
      expect.objectContaining({
        canViewGates: true,
        canManageRequests: true,
        canDeliver: true,
        canEscalate: true,
      }),
    );
    assertNoSettingsLeak(profile.body);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/roles`)
      .set('Authorization', bearer(staffTokens))
      .expect(403);
    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/dismissal/settings`)
      .set('Authorization', bearer(staffTokens))
      .send({ enabled: true })
      .expect(403);
    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/dismissal/staff-assignments`)
      .set('Authorization', bearer(staffTokens))
      .send({ staffUserId: createdStaffUserId })
      .expect(403);
  });

  async function findSystemRole(key: string): Promise<{ id: string }> {
    const role = await prisma.role.findFirst({
      where: { key, schoolId: null, isSystem: true, deletedAt: null },
      select: { id: true },
    });
    if (!role) {
      throw new Error(`${key} system role not found. Run npm run seed first.`);
    }

    return role;
  }

  async function createUserWithMembership(params: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    roleId: string;
    userType: UserType;
  }): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        userType: params.userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(params.password, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId,
        schoolId,
        roleId: params.roleId,
        userType: params.userType,
        status: MembershipStatus.ACTIVE,
      },
    });

    return user.id;
  }

  async function login(email: string, password: string): Promise<AuthTokens> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password })
      .expect(200);

    return {
      accessToken: response.body.accessToken,
      refreshToken: response.body.refreshToken,
    };
  }

  async function expectUserAndMembershipType(
    userId: string,
    userType: UserType,
  ): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { userType: true },
    });
    expect(user.userType).toBe(userType);

    const membership = await prisma.membership.findFirstOrThrow({
      where: {
        userId,
        schoolId,
        deletedAt: null,
        status: MembershipStatus.ACTIVE,
      },
      select: { userType: true, roleId: true },
    });
    expect(membership.userType).toBe(userType);
    if (userType === UserType.DISMISSAL_STAFF) {
      expect(membership.roleId).toBe(dismissalStaffRoleId);
    }
  }

  function bearer(tokens: AuthTokens): string {
    return `Bearer ${tokens.accessToken}`;
  }
});

function assertNoSettingsLeak(value: unknown): void {
  for (const forbiddenKey of [
    'schoolId',
    'organizationId',
    'membershipId',
    'permissionId',
    'deletedAt',
    'passwordHash',
    'credentialVersion',
    'updatedById',
  ]) {
    expectNoObjectKey(value, forbiddenKey);
  }
}

function expectNoObjectKey(value: unknown, forbiddenKey: string): void {
  if (!value || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    for (const item of value) {
      expectNoObjectKey(item, forbiddenKey);
    }
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    expect(key).not.toBe(forbiddenKey);
    expectNoObjectKey(nested, forbiddenKey);
  }
}
