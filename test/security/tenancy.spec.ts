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

/**
 * Tenancy integration test — proves that after the global guard stack runs,
 * each admin's /auth/me returns their own school membership and that
 * requests without a valid token are rejected with auth.token.invalid.
 *
 * The test provisions a second isolated organization/school/admin at
 * setup time so we have two distinct school scopes to compare against.
 * It tolerates (and relies on) the seeded demo admin from
 * prisma/seeds/04-demo-org.seed.ts being present.
 */

const GLOBAL_PREFIX = '/api/v1';

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';

const TENANT_B_ORG_SLUG = 'tenancy-test-org-b';
const TENANT_B_SCHOOL_SLUG = 'tenancy-test-school-b';
const TENANT_B_ADMIN_EMAIL = 'admin-b@tenancy-test.moazez.local';
const TENANT_B_ADMIN_PASSWORD = 'SchoolB123!';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

describe('Tenancy — school scope isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let tenantBUserId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const schoolAdminRole = await prisma.role.findFirst({
      where: { key: 'school_admin', schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!schoolAdminRole) {
      throw new Error(
        'school_admin system role not found — run `npm run seed` first.',
      );
    }

    const orgB = await prisma.organization.upsert({
      where: { slug: TENANT_B_ORG_SLUG },
      update: { status: OrganizationStatus.ACTIVE },
      create: {
        slug: TENANT_B_ORG_SLUG,
        name: 'Tenancy Test Org B',
        status: OrganizationStatus.ACTIVE,
      },
    });
    const schoolB = await prisma.school.upsert({
      where: {
        organizationId_slug: {
          organizationId: orgB.id,
          slug: TENANT_B_SCHOOL_SLUG,
        },
      },
      update: { status: SchoolStatus.ACTIVE },
      create: {
        organizationId: orgB.id,
        slug: TENANT_B_SCHOOL_SLUG,
        name: 'Tenancy Test School B',
        status: SchoolStatus.ACTIVE,
      },
    });
    const passwordHash = await argon2.hash(
      TENANT_B_ADMIN_PASSWORD,
      ARGON2_OPTIONS,
    );
    const adminB = await prisma.user.upsert({
      where: { email: TENANT_B_ADMIN_EMAIL },
      update: { passwordHash, status: UserStatus.ACTIVE },
      create: {
        email: TENANT_B_ADMIN_EMAIL,
        firstName: 'Tenant',
        lastName: 'Admin B',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash,
      },
    });
    tenantBUserId = adminB.id;

    const existingMembership = await prisma.membership.findFirst({
      where: {
        userId: adminB.id,
        organizationId: orgB.id,
        schoolId: schoolB.id,
        roleId: schoolAdminRole.id,
      },
    });
    if (existingMembership) {
      await prisma.membership.update({
        where: { id: existingMembership.id },
        data: { status: MembershipStatus.ACTIVE, endedAt: null },
      });
    } else {
      await prisma.membership.create({
        data: {
          userId: adminB.id,
          organizationId: orgB.id,
          schoolId: schoolB.id,
          roleId: schoolAdminRole.id,
          userType: UserType.SCHOOL_USER,
          status: MembershipStatus.ACTIVE,
          startedAt: new Date(),
        },
      });
    }

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
      await prisma.session.deleteMany({ where: { userId: tenantBUserId } });
      await prisma.membership.deleteMany({ where: { userId: tenantBUserId } });
      await prisma.user.deleteMany({ where: { id: tenantBUserId } });
      await prisma.school.deleteMany({
        where: { slug: TENANT_B_SCHOOL_SLUG },
      });
      await prisma.organization.deleteMany({
        where: { slug: TENANT_B_ORG_SLUG },
      });
      await prisma.$disconnect();
    }
  });

  async function login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const res = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password })
      .expect(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    return res.body;
  }

  it('public route /health is reachable without credentials', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/health`)
      .expect(200);
  });

  it('rejects /auth/me without a Bearer token as auth.token.invalid', async () => {
    const res = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/auth/me`)
      .expect(401);
    expect(res.body?.error?.code).toBe('auth.token.invalid');
  });

  it('rejects /auth/me with a bogus Bearer token', async () => {
    const res = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/auth/me`)
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
    expect(res.body?.error?.code).toBe('auth.token.invalid');
  });

  it('rejects /auth/login with an unknown email', async () => {
    const res = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({
        email: 'nobody-at-all@tenancy-test.moazez.local',
        password: 'whatever',
      })
      .expect(401);
    expect(res.body?.error?.code).toBe('auth.credentials.invalid');
  });

  it('admin A sees only school A on /auth/me', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const res = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/auth/me`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.email).toBe(DEMO_ADMIN_EMAIL);
    expect(res.body.activeMembership).toBeTruthy();
    expect(res.body.activeMembership.schoolId).toBeTruthy();
    expect(Array.isArray(res.body.activeMembership.permissions)).toBe(true);
    expect(res.body.activeMembership.permissions.length).toBeGreaterThan(0);
  });

  it('admin A and admin B resolve to different school scopes', async () => {
    const aLogin = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const bLogin = await login(TENANT_B_ADMIN_EMAIL, TENANT_B_ADMIN_PASSWORD);

    const [aMe, bMe] = await Promise.all([
      request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/auth/me`)
        .set('Authorization', `Bearer ${aLogin.accessToken}`)
        .expect(200),
      request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/auth/me`)
        .set('Authorization', `Bearer ${bLogin.accessToken}`)
        .expect(200),
    ]);

    const aSchool = aMe.body.activeMembership?.schoolId;
    const bSchool = bMe.body.activeMembership?.schoolId;

    expect(aSchool).toBeTruthy();
    expect(bSchool).toBeTruthy();
    expect(aSchool).not.toEqual(bSchool);
    expect(aMe.body.email).not.toEqual(bMe.body.email);
  });

  it('logout revokes the session and /auth/me then returns auth.session.revoked', async () => {
    const { accessToken } = await login(
      TENANT_B_ADMIN_EMAIL,
      TENANT_B_ADMIN_PASSWORD,
    );

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/logout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    const res = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/auth/me`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
    expect(res.body?.error?.code).toBe('auth.session.revoked');
  });
});
