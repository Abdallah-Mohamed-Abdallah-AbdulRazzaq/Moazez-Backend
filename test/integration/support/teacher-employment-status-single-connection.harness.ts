import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  MembershipStatus,
  PrismaClient,
  TeacherEmploymentStatus,
  TeacherGender,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../../src/app.module';
import {
  PRISMA_CLIENT_OPTIONS,
  type PrismaClientRuntimeOptions,
} from '../../../src/infrastructure/database/prisma-client-options.provider';

const API = '/api/v1';
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

async function run(): Promise<void> {
  assert.equal(process.env.DATABASE_RUNTIME_ROLE, 'api');
  assert.equal(process.env.DATABASE_CONNECTION_LIMIT, '1');
  assert.equal(process.env.DATABASE_POOL_TIMEOUT_SECONDS, '5');

  const marker = `single-connection-${randomUUID().slice(0, 8)}`;
  const prisma = new PrismaClient();
  let app: INestApplication<App> | undefined;
  let organizationId: string | undefined;
  let schoolId: string | undefined;

  try {
    await prisma.$connect();
    const roles = await prisma.role.findMany({
      where: {
        schoolId: null,
        isSystem: true,
        key: 'school_admin',
        deletedAt: null,
      },
      select: { id: true, key: true },
    });
    const schoolAdminRoleId = requireRole(roles, 'school_admin');

    const organization = await prisma.organization.create({
      data: { name: `${marker}-organization`, slug: `${marker}-organization` },
      select: { id: true },
    });
    organizationId = organization.id;
    const school = await prisma.school.create({
      data: {
        organizationId,
        name: `${marker}-school`,
        slug: `${marker}-school`,
      },
      select: { id: true },
    });
    schoolId = school.id;

    const adminPassword = `Z9!${randomUUID()}aA`;
    const adminEmail = `${marker}-admin@integration.invalid`;
    await prisma.user.create({
      data: {
        email: adminEmail,
        firstName: 'Single',
        lastName: 'Connection',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(adminPassword, ARGON2_OPTIONS),
        memberships: {
          create: {
            organizationId,
            schoolId,
            roleId: schoolAdminRoleId,
            userType: UserType.SCHOOL_USER,
            status: MembershipStatus.ACTIVE,
          },
        },
      },
      select: { id: true },
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(API.slice(1));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useLogger(false);
    await app.init();

    const prismaOptions = app.get<PrismaClientRuntimeOptions>(
      PRISMA_CLIENT_OPTIONS,
    );
    const applicationDatasource = new URL(
      requireString(prismaOptions.datasourceUrl, 'application datasource'),
    );
    assert.equal(
      applicationDatasource.searchParams.get('connection_limit'),
      '1',
    );
    assert.equal(applicationDatasource.searchParams.get('pool_timeout'), '5');
    console.log('APP_DATABASE_CONNECTION_LIMIT=1');
    console.log('APP_DATABASE_POOL_TIMEOUT_SECONDS=5');
    console.log('SINGLE_CONNECTION_APP_BOOTSTRAP=PASS');

    const login = await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .send({ email: adminEmail, password: adminPassword });
    assert.equal(login.status, 200);
    const loginBody = login.body as unknown as { accessToken?: unknown };
    const accessToken = requireString(loginBody.accessToken, 'access token');
    const authorization = `Bearer ${accessToken}`;

    const created = await request(app.getHttpServer())
      .post(`${API}/teachers`)
      .set('Authorization', authorization)
      .send({
        loginEmail: `${marker}-teacher@integration.invalid`,
        teacherCode: `SC${randomUUID().slice(0, 8)}`.toUpperCase(),
        firstNameAr: 'معلم',
        lastNameAr: 'اختباري',
        firstNameEn: 'Single',
        lastNameEn: 'Connection',
        preferredDisplayLanguage: 'EN',
        gender: TeacherGender.MALE,
        employmentStatus: TeacherEmploymentStatus.ACTIVE,
        workingDays: [],
      });
    assert.equal(created.status, 201);
    const createdBody = created.body as unknown as {
      id?: unknown;
      userId?: unknown;
    };
    const teacherId = requireString(createdBody.id, 'teacher id');
    const teacherUserId = requireString(createdBody.userId, 'teacher user id');

    await createLiveSession(prisma, teacherUserId, marker, 'before-inactive');
    const inactive = await request(app.getHttpServer())
      .patch(`${API}/teachers/${teacherId}/employment-status`)
      .set('Authorization', authorization)
      .send({ employmentStatus: TeacherEmploymentStatus.INACTIVE });
    assert.equal(inactive.status, 200);
    const inactiveBody = inactive.body as unknown as {
      teacher?: unknown;
      transition?: unknown;
    };
    assert.deepEqual(pickTeacherState(inactiveBody.teacher), {
      accountStatus: UserStatus.DISABLED,
      membershipStatus: MembershipStatus.SUSPENDED,
      membershipEndedAt: null,
      employmentStatus: TeacherEmploymentStatus.INACTIVE,
    });
    assertAllocationSummary(inactiveBody.transition);
    await assertPersistedState(prisma, {
      schoolId,
      teacherId,
      teacherUserId,
      employmentStatus: TeacherEmploymentStatus.INACTIVE,
      userStatus: UserStatus.DISABLED,
      membershipStatus: MembershipStatus.SUSPENDED,
    });
    console.log('SINGLE_CONNECTION_ACTIVE_TO_INACTIVE=PASS');

    const provisionedAt = new Date();
    await prisma.user.update({
      where: { id: teacherUserId },
      data: {
        passwordHash: await argon2.hash(`Z9!${randomUUID()}aA`, ARGON2_OPTIONS),
        mustChangePassword: false,
        passwordProvisionedAt: provisionedAt,
        passwordChangedAt: provisionedAt,
        credentialVersion: { increment: 1 },
      },
      select: { id: true },
    });
    await createLiveSession(prisma, teacherUserId, marker, 'before-active');
    const active = await request(app.getHttpServer())
      .patch(`${API}/teachers/${teacherId}/employment-status`)
      .set('Authorization', authorization)
      .send({ employmentStatus: TeacherEmploymentStatus.ACTIVE });
    assert.equal(active.status, 200);
    const activeBody = active.body as unknown as {
      teacher?: unknown;
      transition?: unknown;
    };
    assert.deepEqual(pickTeacherState(activeBody.teacher), {
      accountStatus: UserStatus.ACTIVE,
      membershipStatus: MembershipStatus.ACTIVE,
      membershipEndedAt: null,
      employmentStatus: TeacherEmploymentStatus.ACTIVE,
    });
    assertAllocationSummary(activeBody.transition);
    await assertPersistedState(prisma, {
      schoolId,
      teacherId,
      teacherUserId,
      employmentStatus: TeacherEmploymentStatus.ACTIVE,
      userStatus: UserStatus.ACTIVE,
      membershipStatus: MembershipStatus.ACTIVE,
    });
    console.log('SINGLE_CONNECTION_INACTIVE_TO_ACTIVE=PASS');
    console.log('SINGLE_CONNECTION_SESSION_REVOCATION=PASS');
    console.log('SINGLE_CONNECTION_ALLOCATION_SUMMARY=PASS');
    console.log('SINGLE_CONNECTION_HTTP_REGRESSION=PASS');
  } finally {
    if (app) await app.close();
    const users = await prisma.user.findMany({
      where: { email: { startsWith: marker } },
      select: { id: true },
    });
    const userIds = users.map(({ id }) => id);
    if (userIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            ...(organizationId ? [{ organizationId }] : []),
            { actorId: { in: userIds } },
            { resourceId: { in: userIds } },
          ],
        },
      });
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.teacherProfile.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (schoolId) await prisma.school.deleteMany({ where: { id: schoolId } });
    if (organizationId) {
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    await prisma.$disconnect();
  }
}

function requireRole(
  roles: Array<{ id: string; key: string }>,
  key: string,
): string {
  const role = roles.find((candidate) => candidate.key === key);
  assert.ok(role, `Required integration role is missing: ${key}`);
  return role.id;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be returned`);
  }
  return value;
}

function pickTeacherState(value: unknown) {
  const teacher = value as Record<string, unknown>;
  return {
    accountStatus: teacher.accountStatus,
    membershipStatus: teacher.membershipStatus,
    membershipEndedAt: teacher.membershipEndedAt,
    employmentStatus: teacher.employmentStatus,
  };
}

function assertAllocationSummary(value: unknown): void {
  const transition = value as {
    reassignmentRequired?: unknown;
    allocationSummary?: Record<string, unknown>;
  };
  assert.equal(transition.reassignmentRequired, false);
  assert.deepEqual(transition.allocationSummary, {
    currentActiveCount: 0,
    futureCount: 0,
    historicalCount: 0,
    currentInactiveCount: 0,
    inconsistentCount: 0,
    invalidCount: 0,
    integrityRiskCount: 0,
    integrityReason: 'none',
  });
}

async function createLiveSession(
  prisma: PrismaClient,
  userId: string,
  marker: string,
  label: string,
): Promise<void> {
  await prisma.session.create({
    data: {
      userId,
      refreshTokenHash: `${marker}-${label}-${randomUUID()}`,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
}

async function assertPersistedState(
  prisma: PrismaClient,
  input: {
    schoolId: string;
    teacherId: string;
    teacherUserId: string;
    employmentStatus: TeacherEmploymentStatus;
    userStatus: UserStatus;
    membershipStatus: MembershipStatus;
  },
): Promise<void> {
  const [profile, user, membership, activeSessionCount] = await Promise.all([
    prisma.teacherProfile.findUnique({ where: { id: input.teacherId } }),
    prisma.user.findUnique({ where: { id: input.teacherUserId } }),
    prisma.membership.findFirst({
      where: { userId: input.teacherUserId, schoolId: input.schoolId },
    }),
    prisma.session.count({
      where: { userId: input.teacherUserId, revokedAt: null },
    }),
  ]);
  assert.equal(profile?.employmentStatus, input.employmentStatus);
  assert.equal(user?.status, input.userStatus);
  assert.equal(membership?.status, input.membershipStatus);
  assert.equal(membership?.endedAt, null);
  assert.equal(activeSessionCount, 0);
}

run().catch((error: unknown) => {
  const errorName =
    error && typeof error === 'object' && 'name' in error
      ? String(error.name).slice(0, 128)
      : 'UnknownError';
  console.error(`SINGLE_CONNECTION_HTTP_REGRESSION=FAIL:${errorName}`);
  process.exitCode = 1;
});
