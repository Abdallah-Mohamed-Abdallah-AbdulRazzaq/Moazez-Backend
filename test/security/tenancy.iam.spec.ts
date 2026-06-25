import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MembershipStatus,
  PrismaClient,
  UserStatus,
  UserType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

const GLOBAL_PREFIX = '/api/v1';
const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const TARGET_PASSWORD = 'IamTarget123!';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

jest.setTimeout(90_000);

describe('IAM disabled-user session invalidation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId = '';
  let demoOrganizationId = '';
  let schoolAdminRoleId = '';
  let adminAuth: AuthTokens;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const demoSchool = await prisma.school.findFirst({
      where: { slug: 'moazez-academy' },
      select: { id: true, organizationId: true },
    });
    if (!demoSchool) {
      throw new Error('Demo school not found - run `npm run seed` first.');
    }
    demoSchoolId = demoSchool.id;
    demoOrganizationId = demoSchool.organizationId;

    const schoolAdminRole = await prisma.role.findFirst({
      where: { key: 'school_admin', schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!schoolAdminRole) {
      throw new Error(
        'school_admin system role not found - run `npm run seed` first.',
      );
    }
    schoolAdminRoleId = schoolAdminRole.id;

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

    adminAuth = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { actorId: { in: createdUserIds } },
            { resourceId: { in: createdUserIds } },
          ],
        },
      });
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.$disconnect();
    }
  });

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

  async function createTargetUser(label: string): Promise<{
    id: string;
    email: string;
  }> {
    const email = `iam-${label}-${randomUUID()}@security.moazez.local`;
    const user = await prisma.user.create({
      data: {
        email,
        firstName: 'Iam',
        lastName: label,
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(TARGET_PASSWORD, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        roleId: schoolAdminRoleId,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
      },
    });

    return { id: user.id, email };
  }

  async function activeSessionCount(userId: string): Promise<number> {
    return prisma.session.count({
      where: { userId, revokedAt: null },
    });
  }

  it('normalizes uppercase login identifiers before lookup', async () => {
    const target = await createTargetUser('normalized-login');

    const mixedCase = target.email.toUpperCase();
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email: mixedCase, password: TARGET_PASSWORD })
      .expect(200);

    expect(response.body.user.id).toBe(target.id);
    expect(response.body.user.email).toBe(target.email);
  });

  it('Settings disable revokes active sessions and old tokens are rejected', async () => {
    const target = await createTargetUser('settings-disable');
    const targetAuth = await login(target.email, TARGET_PASSWORD);

    await expect(activeSessionCount(target.id)).resolves.toBe(1);

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/settings/users/${target.id}/status`)
      .set('Authorization', `Bearer ${adminAuth.accessToken}`)
      .send({ status: 'inactive' })
      .expect(200);

    await expect(activeSessionCount(target.id)).resolves.toBe(0);

    const oldAccess = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/auth/me`)
      .set('Authorization', `Bearer ${targetAuth.accessToken}`)
      .expect(401);
    expect(oldAccess.body?.error?.code).toBe('auth.session.revoked');

    const oldRefresh = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/refresh`)
      .send({ refreshToken: targetAuth.refreshToken })
      .expect(401);
    expect(oldRefresh.body?.error?.code).toBe('auth.refresh.rotated');

    await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/settings/users/${target.id}/status`)
      .set('Authorization', `Bearer ${adminAuth.accessToken}`)
      .send({ status: 'active' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email: target.email, password: TARGET_PASSWORD })
      .expect(200);
  });

  it('blocks an existing access token if the user is suspended without session revocation', async () => {
    const target = await createTargetUser('access-suspended');
    const targetAuth = await login(target.email, TARGET_PASSWORD);

    await prisma.user.update({
      where: { id: target.id },
      data: { status: UserStatus.SUSPENDED },
    });

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/auth/me`)
      .set('Authorization', `Bearer ${targetAuth.accessToken}`)
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.account.disabled');
    await expect(activeSessionCount(target.id)).resolves.toBe(0);
  });

  it('blocks refresh token rotation if the user is disabled without session revocation', async () => {
    const target = await createTargetUser('refresh-disabled');
    const targetAuth = await login(target.email, TARGET_PASSWORD);

    await prisma.user.update({
      where: { id: target.id },
      data: { status: UserStatus.DISABLED },
    });

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/refresh`)
      .send({ refreshToken: targetAuth.refreshToken })
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.account.disabled');
    await expect(activeSessionCount(target.id)).resolves.toBe(0);
  });
});
