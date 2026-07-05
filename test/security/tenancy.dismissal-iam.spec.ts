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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const PASSWORD = 'DismissalStaff123!';
const TEST_MARKER = 'dismissal-iam-1a';
const ORG_SLUG = `${TEST_MARKER}-org`;
const SCHOOL_SLUG = `${TEST_MARKER}-school`;
const DISMISSAL_STAFF_EMAIL = `${TEST_MARKER}@moazez.local`;

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

const EXPECTED_DISMISSAL_PERMISSION_CODES = [
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

const EXPECTED_DISMISSAL_STAFF_PERMISSIONS = [
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

const FORBIDDEN_DISMISSAL_STAFF_PERMISSIONS = [
  'files.downloads.view',
  'files.uploads.manage',
  'students.records.manage',
  'students.guardians.manage',
  'dismissal.settings.manage',
  'dismissal.staff.manage',
  'dismissal.gates.manage',
] as const;

const ROLE_PERMISSION_COUNT_BASELINES = {
  TEACHER_PERMISSIONS: 54,
  PARENT_PERMISSIONS: 45,
  STUDENT_PERMISSIONS: 57,
} as const;

type PermissionEntry = {
  code: string;
  module: string;
  resource: string;
  action: string;
  description: string;
};

function readSource(path: string): string {
  return readFileSync(path, 'utf8');
}

function readConstStringArray(source: string, constName: string): string[] {
  const match = source.match(
    new RegExp(`const ${constName} = \\[([\\s\\S]*?)\\];`),
  );
  expect(match).not.toBeNull();
  return [...match![1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

function readPermissionEntries(seedSource: string): PermissionEntry[] {
  return [
    ...seedSource.matchAll(
      /\{\s*code:\s*'([^']+)',\s*module:\s*'([^']+)',\s*resource:\s*'([^']+)',\s*action:\s*'([^']+)',\s*description:\s*'([^']+)'\s*\}/g,
    ),
  ].map((match) => ({
    code: match[1],
    module: match[2],
    resource: match[3],
    action: match[4],
    description: match[5],
  }));
}

function findMigrationSql(): string {
  const migrationsRoot = join(process.cwd(), 'prisma', 'migrations');
  const migrationFolder = readdirSync(migrationsRoot).find((entry) =>
    entry.endsWith('_dismissal_staff_identity_permissions'),
  );

  expect(migrationFolder).toBeTruthy();
  return readSource(join(migrationsRoot, migrationFolder!, 'migration.sql'));
}

describe('DISMISSAL-IAM-1A - user type and permission seed contract', () => {
  const schemaSource = readSource('prisma/schema.prisma');
  const permissionSeedSource = readSource('prisma/seeds/01-permissions.seed.ts');
  const systemRoleSeedSource = readSource(
    'prisma/seeds/02-system-roles.seed.ts',
  );

  it('adds DISMISSAL_STAFF user type while preserving PICKUP_DELEGATE', () => {
    const userTypeBlock = schemaSource.match(
      /enum UserType \{([\s\S]*?)\n\}/,
    )?.[1];

    expect(userTypeBlock).toContain('PICKUP_DELEGATE');
    expect(userTypeBlock).toContain('DISMISSAL_STAFF');
    expect(userTypeBlock).toContain('SERVICE_ACCOUNT');
  });

  it('does not add DISMISSAL_STAFF to AppDeviceTokenSurface', () => {
    const tokenSurfaceBlock = schemaSource.match(
      /enum AppDeviceTokenSurface \{([\s\S]*?)\n\}/,
    )?.[1];

    expect(tokenSurfaceBlock).toBeTruthy();
    expect(tokenSurfaceBlock).not.toContain('DISMISSAL_STAFF');
  });

  it('migration only adds DISMISSAL_STAFF to the mapped user_type enum', () => {
    const migrationSql = findMigrationSql().trim();

    expect(migrationSql).toBe(
      'ALTER TYPE "user_type" ADD VALUE \'DISMISSAL_STAFF\';',
    );
    expect(migrationSql).not.toMatch(/CREATE\s+TABLE/i);
    expect(migrationSql).not.toMatch(/ALTER\s+TABLE/i);
    expect(migrationSql).not.toMatch(/CREATE\s+INDEX/i);
    expect(migrationSql).not.toMatch(/Dismissal(Settings|Gate|Request|Notification)/);
    expect(migrationSql).not.toContain('app_device_token_surface');
  });

  it('permission seed contains the exact dismissal permission catalog', () => {
    const entries = readPermissionEntries(permissionSeedSource);
    const dismissalEntries = entries.filter((entry) =>
      entry.code.startsWith('dismissal.'),
    );

    expect(dismissalEntries.map((entry) => entry.code).sort()).toEqual(
      [...EXPECTED_DISMISSAL_PERMISSION_CODES].sort(),
    );
    for (const entry of dismissalEntries) {
      expect(entry.module).toBe('dismissal');
      expect(entry.description).toBeTruthy();
      expect(entry.resource).toBeTruthy();
      expect(entry.action).toBeTruthy();
    }
  });

  it('permission seed has no duplicate permission codes', () => {
    const entries = readPermissionEntries(permissionSeedSource);
    const codes = entries.map((entry) => entry.code);
    const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);

    expect(duplicates).toEqual([]);
  });

  it('defines the exact safe Dismissal Staff app-operator permission list', () => {
    const permissions = readConstStringArray(
      systemRoleSeedSource,
      'DISMISSAL_STAFF_PERMISSIONS',
    );

    expect(permissions).toEqual([...EXPECTED_DISMISSAL_STAFF_PERMISSIONS]);
  });

  it('seeds the dismissal_staff system role with the approved permission array', () => {
    const roleMatch = systemRoleSeedSource.match(
      /\{\s*key:\s*'dismissal_staff',\s*name:\s*'Dismissal Staff',\s*description:\s*'School dismissal app access for assigned pickup and handover operations',\s*permissions:\s*DISMISSAL_STAFF_PERMISSIONS,\s*\}/,
    );

    expect(roleMatch).not.toBeNull();
  });

  it('Dismissal Staff role excludes broad admin, storage, student, and communication permissions', () => {
    const permissions = readConstStringArray(
      systemRoleSeedSource,
      'DISMISSAL_STAFF_PERMISSIONS',
    );

    for (const permission of permissions) {
      expect(permission).not.toMatch(/^platform\./);
      expect(permission).not.toMatch(/^settings\./);
      expect(permission).not.toMatch(/^communication\./);
    }
    for (const forbiddenPermission of FORBIDDEN_DISMISSAL_STAFF_PERMISSIONS) {
      expect(permissions).not.toContain(forbiddenPermission);
    }
  });

  it('keeps Parent, Teacher, and Student role arrays at their approved counts and outside dismissal scope', () => {
    for (const [constName, expectedCount] of Object.entries(
      ROLE_PERMISSION_COUNT_BASELINES,
    )) {
      const permissions = readConstStringArray(systemRoleSeedSource, constName);

      expect(permissions).toHaveLength(expectedCount);
      expect(permissions.filter((permission) => permission.startsWith('dismissal.'))).toEqual(
        [],
      );
    }
  });

  it('keeps IAM migration limited now that dismissal runtime is implemented separately', () => {
    expect(
      existsSync(join(process.cwd(), 'src', 'modules', 'dismissal')),
    ).toBe(true);
  });
});

describe('DISMISSAL-IAM-1A - /auth/me role permission mapping', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let testUserId: string | undefined;
  let testOrganizationId: string | undefined;
  let testSchoolId: string | undefined;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const dismissalStaffRole = await prisma.role.findFirst({
      where: {
        key: 'dismissal_staff',
        schoolId: null,
        isSystem: true,
        deletedAt: null,
      },
      select: {
        id: true,
        rolePermissions: {
          select: {
            permission: { select: { code: true } },
          },
        },
      },
    });
    if (!dismissalStaffRole) {
      throw new Error(
        'dismissal_staff system role not found - run `npm run seed` first.',
      );
    }

    const seededPermissionCodes = dismissalStaffRole.rolePermissions.map(
      (rolePermission) => rolePermission.permission.code,
    );
    expect(seededPermissionCodes.sort()).toEqual(
      [...EXPECTED_DISMISSAL_STAFF_PERMISSIONS].sort(),
    );

    const organization = await prisma.organization.upsert({
      where: { slug: ORG_SLUG },
      update: { status: OrganizationStatus.ACTIVE },
      create: {
        slug: ORG_SLUG,
        name: 'Dismissal IAM Test Organization',
        status: OrganizationStatus.ACTIVE,
      },
    });
    testOrganizationId = organization.id;

    const school = await prisma.school.upsert({
      where: {
        organizationId_slug: {
          organizationId: organization.id,
          slug: SCHOOL_SLUG,
        },
      },
      update: { status: SchoolStatus.ACTIVE },
      create: {
        organizationId: organization.id,
        slug: SCHOOL_SLUG,
        name: 'Dismissal IAM Test School',
        status: SchoolStatus.ACTIVE,
      },
    });
    testSchoolId = school.id;

    const passwordHash = await argon2.hash(PASSWORD, ARGON2_OPTIONS);
    const user = await prisma.user.upsert({
      where: { email: DISMISSAL_STAFF_EMAIL },
      update: {
        firstName: 'Dismissal',
        lastName: 'Staff',
        userType: UserType.DISMISSAL_STAFF,
        passwordHash,
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
      create: {
        email: DISMISSAL_STAFF_EMAIL,
        firstName: 'Dismissal',
        lastName: 'Staff',
        userType: UserType.DISMISSAL_STAFF,
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    });
    testUserId = user.id;

    await prisma.membership.deleteMany({
      where: {
        userId: user.id,
        organizationId: organization.id,
        schoolId: school.id,
      },
    });
    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        schoolId: school.id,
        roleId: dismissalStaffRole.id,
        userType: UserType.DISMISSAL_STAFF,
        status: MembershipStatus.ACTIVE,
        startedAt: new Date(),
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
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) {
      if (testUserId) {
        await prisma.session.deleteMany({ where: { userId: testUserId } });
        await prisma.membership.deleteMany({ where: { userId: testUserId } });
        await prisma.auditLog.deleteMany({ where: { actorId: testUserId } });
        await prisma.user.deleteMany({ where: { id: testUserId } });
      }
      if (testSchoolId) {
        await prisma.school.deleteMany({ where: { id: testSchoolId } });
      }
      if (testOrganizationId) {
        await prisma.organization.deleteMany({
          where: { id: testOrganizationId },
        });
      }
      await prisma.$disconnect();
    }
  });

  it('/auth/me exposes exactly the Dismissal Staff role permissions through existing role mapping', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email: DISMISSAL_STAFF_EMAIL, password: PASSWORD })
      .expect(200);

    const accessToken = loginResponse.body.accessToken as string;
    expect(accessToken).toBeTruthy();

    const meResponse = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/auth/me`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(meResponse.body.userType).toBe('DISMISSAL_STAFF');
    expect(meResponse.body.activeMembership.roleKey).toBe('dismissal_staff');
    expect(meResponse.body.activeMembership.schoolId).toBe(testSchoolId);
    expect(meResponse.body.activeMembership.permissions.sort()).toEqual(
      [...EXPECTED_DISMISSAL_STAFF_PERMISSIONS].sort(),
    );

    const permissions = meResponse.body.activeMembership.permissions as string[];
    for (const permission of permissions) {
      expect(permission).not.toMatch(/^platform\./);
      expect(permission).not.toMatch(/^settings\./);
      expect(permission).not.toMatch(/^communication\./);
    }
    for (const forbiddenPermission of FORBIDDEN_DISMISSAL_STAFF_PERMISSIONS) {
      expect(permissions).not.toContain(forbiddenPermission);
    }
  });
});
