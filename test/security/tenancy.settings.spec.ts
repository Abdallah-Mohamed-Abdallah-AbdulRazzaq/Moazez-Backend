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

const DEMO_ADMIN_EMAIL = 'admin@academy.moazez.dev';
const DEMO_ADMIN_PASSWORD = 'School123!';
const DEMO_VIEWER_EMAIL = 'viewer@settings-tenancy.moazez.local';
const DEMO_VIEWER_PASSWORD = 'SettingsViewer123!';

const TENANT_B_ORG_SLUG = 'settings-tenancy-org-b';
const TENANT_B_SCHOOL_SLUG = 'settings-tenancy-school-b';
const TENANT_B_ADMIN_EMAIL = 'admin-b@settings-tenancy.moazez.local';
const TENANT_B_ADMIN_PASSWORD = 'SchoolB123!';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

describe('Settings tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId: string;
  let demoOrganizationId: string;
  let demoViewerRoleId: string;
  let demoViewerUserId: string;
  let tenantBSchoolId: string;
  let tenantBUserId: string;
  let tenantBRoleId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const demoSchool = await prisma.school.findFirst({
      where: { slug: 'moazez-academy' },
      select: { id: true, organizationId: true },
    });
    if (!demoSchool) {
      throw new Error('Demo school not found — run `npm run seed` first.');
    }
    demoSchoolId = demoSchool.id;
    demoOrganizationId = demoSchool.organizationId;

    const schoolAdminRole = await prisma.role.findFirst({
      where: { key: 'school_admin', schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!schoolAdminRole) {
      throw new Error('school_admin system role not found — run `npm run seed` first.');
    }

    const demoAdmin = await prisma.user.findUnique({
      where: { email: DEMO_ADMIN_EMAIL },
      select: { id: true },
    });
    if (!demoAdmin) {
      throw new Error('Demo admin not found.');
    }

    await prisma.membership.updateMany({
      where: {
        userId: demoAdmin.id,
        schoolId: demoSchoolId,
        deletedAt: null,
      },
      data: {
        roleId: schoolAdminRole.id,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
        endedAt: null,
      },
    });

    await prisma.schoolProfile.upsert({
      where: { schoolId: demoSchoolId },
      update: {
        schoolName: 'Demo School A Branding',
        timezone: 'Africa/Cairo',
        city: 'Cairo',
        country: 'Egypt',
      },
      create: {
        schoolId: demoSchoolId,
        schoolName: 'Demo School A Branding',
        timezone: 'Africa/Cairo',
        city: 'Cairo',
        country: 'Egypt',
      },
    });

    const viewerRole = await prisma.role.findFirst({
      where: {
        schoolId: demoSchoolId,
        key: 'settings_security_limited',
      },
      select: { id: true },
    });

    if (viewerRole) {
      demoViewerRoleId = viewerRole.id;
      await prisma.rolePermission.deleteMany({ where: { roleId: viewerRole.id } });
    } else {
      const createdViewerRole = await prisma.role.create({
        data: {
          schoolId: demoSchoolId,
          key: 'settings_security_limited',
          name: 'Settings Security Limited',
          description: 'Same-school user without security manage access',
          isSystem: false,
        },
      });
      demoViewerRoleId = createdViewerRole.id;
    }

    const demoViewerPasswordHash = await argon2.hash(
      DEMO_VIEWER_PASSWORD,
      ARGON2_OPTIONS,
    );

    const demoViewer = await prisma.user.upsert({
      where: { email: DEMO_VIEWER_EMAIL },
      update: {
        firstName: 'Settings',
        lastName: 'Viewer',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: demoViewerPasswordHash,
      },
      create: {
        email: DEMO_VIEWER_EMAIL,
        firstName: 'Settings',
        lastName: 'Viewer',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: demoViewerPasswordHash,
      },
    });
    demoViewerUserId = demoViewer.id;

    const existingViewerMembership = await prisma.membership.findFirst({
      where: {
        userId: demoViewer.id,
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        roleId: demoViewerRoleId,
      },
      select: { id: true },
    });

    if (existingViewerMembership) {
      await prisma.membership.update({
        where: { id: existingViewerMembership.id },
        data: {
          status: MembershipStatus.ACTIVE,
          endedAt: null,
          userType: UserType.SCHOOL_USER,
        },
      });
    } else {
      await prisma.membership.create({
        data: {
          userId: demoViewer.id,
          organizationId: demoOrganizationId,
          schoolId: demoSchoolId,
          roleId: demoViewerRoleId,
          userType: UserType.SCHOOL_USER,
          status: MembershipStatus.ACTIVE,
        },
      });
    }

    const orgB = await prisma.organization.upsert({
      where: { slug: TENANT_B_ORG_SLUG },
      update: { status: OrganizationStatus.ACTIVE },
      create: {
        slug: TENANT_B_ORG_SLUG,
        name: 'Settings Tenancy Org B',
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
        name: 'Settings Tenancy School B',
        status: SchoolStatus.ACTIVE,
      },
    });
    tenantBSchoolId = schoolB.id;

    await prisma.schoolProfile.upsert({
      where: { schoolId: tenantBSchoolId },
      update: {
        schoolName: 'School B Branding',
        timezone: 'Europe/Berlin',
        city: 'Berlin',
        country: 'Germany',
      },
      create: {
        schoolId: tenantBSchoolId,
        schoolName: 'School B Branding',
        timezone: 'Europe/Berlin',
        city: 'Berlin',
        country: 'Germany',
      },
    });

    await prisma.securitySetting.upsert({
      where: { schoolId: tenantBSchoolId },
      update: {
        enforceTwoFactor: true,
        sessionTimeoutMinutes: 25,
      },
      create: {
        schoolId: tenantBSchoolId,
        enforceTwoFactor: true,
        sessionTimeoutMinutes: 25,
      },
    });

    const passwordHash = await argon2.hash(
      TENANT_B_ADMIN_PASSWORD,
      ARGON2_OPTIONS,
    );

    const adminB = await prisma.user.upsert({
      where: { email: TENANT_B_ADMIN_EMAIL },
      update: {
        firstName: 'Tenant',
        lastName: 'Admin B',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash,
      },
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
      select: { id: true },
    });

    if (existingMembership) {
      await prisma.membership.update({
        where: { id: existingMembership.id },
        data: {
          status: MembershipStatus.ACTIVE,
          endedAt: null,
          userType: UserType.SCHOOL_USER,
        },
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
        },
      });
    }

    const roleB = await prisma.role.create({
      data: {
        schoolId: schoolB.id,
        key: 'settings_tenancy_role_b',
        name: 'Settings Tenancy Role B',
        description: 'Tenant B scoped custom role',
        isSystem: false,
      },
    });
    tenantBRoleId = roleB.id;

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
      await prisma.membership.deleteMany({ where: { userId: demoViewerUserId } });
      await prisma.user.deleteMany({ where: { id: demoViewerUserId } });
      await prisma.rolePermission.deleteMany({ where: { roleId: demoViewerRoleId } });
      await prisma.role.deleteMany({ where: { id: demoViewerRoleId } });
      await prisma.role.deleteMany({ where: { id: tenantBRoleId } });
      await prisma.securitySetting.deleteMany({ where: { schoolId: tenantBSchoolId } });
      await prisma.schoolProfile.deleteMany({ where: { schoolId: tenantBSchoolId } });
      await prisma.membership.deleteMany({ where: { userId: tenantBUserId } });
      await prisma.user.deleteMany({ where: { id: tenantBUserId } });
      await prisma.school.deleteMany({ where: { id: tenantBSchoolId } });
      await prisma.organization.deleteMany({ where: { slug: TENANT_B_ORG_SLUG } });
      await prisma.$disconnect();
    }
  });

  async function login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password })
      .expect(200);

    return { accessToken: response.body.accessToken };
  }

  it('school A branding returns only school A data', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/branding`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.schoolName).toBe('Demo School A Branding');
    expect(response.body.schoolName).not.toBe('School B Branding');
  });

  it('seeded demo school_admin can access security settings', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/security`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        enforceTwoFactor: expect.any(Boolean),
        sessionTimeoutMinutes: expect.any(Number),
      }),
    );
  });

  it('returns 404 when school A tries to mutate a school B user by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/settings/users/${tenantBUserId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'inactive' })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 404 when school A tries to mutate a school B role by id', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/settings/roles/${tenantBRoleId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Should Not Work' })
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('returns 403 for a protected settings mutation when the permission is missing', async () => {
    const { accessToken } = await login(DEMO_VIEWER_EMAIL, DEMO_VIEWER_PASSWORD);

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/settings/security`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ enforceTwoFactor: true })
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });
});
