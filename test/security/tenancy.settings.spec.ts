import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SchoolEmailConnectionStatus,
  SchoolEmailDeliveryBatchStatus,
  SchoolEmailDeliveryKind,
  SchoolEmailDeliveryRecipientStatus,
  SchoolEmailDeliveryRecipientType,
  SchoolEmailProviderType,
  SchoolEmailTemplateKey,
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
const DEMO_LOGIN_DOMAIN = 'settings-a.moazez.test';
const TENANT_B_LOGIN_DOMAIN = 'settings-b.moazez.test';
const DEMO_GENERATED_LOGIN_EMAIL = `taken.identity@${DEMO_LOGIN_DOMAIN}`;
const TENANT_B_GENERATED_LOGIN_EMAIL = `taken.identity@${TENANT_B_LOGIN_DOMAIN}`;
const CREDENTIAL_TARGET_EMAIL =
  'credential-target@settings-tenancy.moazez.local';
const CREDENTIAL_TARGET_PASSWORD = 'CredentialTarget123!';
const CREDENTIAL_TARGET_NEW_PASSWORD = 'CredentialTarget456!';
const GRANULAR_EMAIL_TEST_PASSWORD = 'GranularEmail123!';

const SIH_PERMISSION_SEEDS = [
  { code: 'settings.permissions.view', module: 'settings', resource: 'permissions', action: 'view', description: 'View the settings permission catalog' },
  { code: 'settings.email.connection.view', module: 'settings', resource: 'email.connection', action: 'view', description: 'View school email provider connection settings' },
  { code: 'settings.email.connection.manage', module: 'settings', resource: 'email.connection', action: 'manage', description: 'Create, test, activate, disable, and update school email provider connection settings' },
  { code: 'settings.email.templates.view', module: 'settings', resource: 'email.templates', action: 'view', description: 'View school email templates and previews' },
  { code: 'settings.email.templates.manage', module: 'settings', resource: 'email.templates', action: 'manage', description: 'Update and reset school email templates' },
  { code: 'settings.email.deliveries.view', module: 'settings', resource: 'email.deliveries', action: 'view', description: 'View school email delivery batches and recipients' },
  { code: 'settings.email.deliveries.manage', module: 'settings', resource: 'email.deliveries', action: 'manage', description: 'Cancel school email delivery batches' },
  { code: 'settings.email.campaigns.view', module: 'settings', resource: 'email.campaigns', action: 'view', description: 'Preview and view school email campaigns' },
  { code: 'settings.email.campaigns.manage', module: 'settings', resource: 'email.campaigns', action: 'manage', description: 'Create school email campaigns' },
  { code: 'settings.email.credential_deliveries.view', module: 'settings', resource: 'email.credential_deliveries', action: 'view', description: 'Preview school credential delivery recipients' },
  { code: 'settings.email.credential_deliveries.manage', module: 'settings', resource: 'email.credential_deliveries', action: 'manage', description: 'Create school credential delivery batches' },
];

const SIH_SCHOOL_ADMIN_PERMISSION_CODES = SIH_PERMISSION_SEEDS.map(
  (permission) => permission.code,
);

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(60_000);

describe('Settings tenancy isolation (security)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let demoSchoolId: string;
  let demoOrganizationId: string;
  let demoViewerRoleId: string;
  let demoViewerUserId: string;
  let demoCredentialUserId: string;
  let tenantBSchoolId: string;
  let tenantBUserId: string;
  let tenantBRoleId: string;
  const createdGranularPermissionRoleIds: string[] = [];
  const createdGranularPermissionUserIds: string[] = [];

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
      throw new Error(
        'school_admin system role not found — run `npm run seed` first.',
      );
    }
    await ensureSihPermissionsForSchoolAdmin(schoolAdminRole.id);

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
      await prisma.rolePermission.deleteMany({
        where: { roleId: viewerRole.id },
      });
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

    const credentialTarget = await prisma.user.upsert({
      where: { email: CREDENTIAL_TARGET_EMAIL },
      update: {
        firstName: 'Credential',
        lastName: 'Target',
        username: 'credential.target',
        contactEmail: 'credential.contact@example.com',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: null,
        mustChangePassword: false,
        passwordChangedAt: null,
        passwordProvisionedAt: null,
        credentialVersion: 0,
      },
      create: {
        email: CREDENTIAL_TARGET_EMAIL,
        firstName: 'Credential',
        lastName: 'Target',
        username: 'credential.target',
        contactEmail: 'credential.contact@example.com',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: null,
      },
    });
    demoCredentialUserId = credentialTarget.id;

    const existingCredentialMembership = await prisma.membership.findFirst({
      where: {
        userId: credentialTarget.id,
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        roleId: schoolAdminRole.id,
      },
      select: { id: true },
    });

    if (existingCredentialMembership) {
      await prisma.membership.update({
        where: { id: existingCredentialMembership.id },
        data: {
          status: MembershipStatus.ACTIVE,
          endedAt: null,
          userType: UserType.SCHOOL_USER,
        },
      });
    } else {
      await prisma.membership.create({
        data: {
          userId: credentialTarget.id,
          organizationId: demoOrganizationId,
          schoolId: demoSchoolId,
          roleId: schoolAdminRole.id,
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

    await prisma.schoolLoginSettings.upsert({
      where: { schoolId: tenantBSchoolId },
      update: {
        loginDomain: TENANT_B_LOGIN_DOMAIN,
        usernameMinLength: 3,
        usernameMaxLength: 40,
        status: 'ACTIVE',
      },
      create: {
        schoolId: tenantBSchoolId,
        loginDomain: TENANT_B_LOGIN_DOMAIN,
        usernameMinLength: 3,
        usernameMaxLength: 40,
        status: 'ACTIVE',
      },
    });

    await prisma.schoolEmailConnection.upsert({
      where: { schoolId: tenantBSchoolId },
      update: {
        providerType: SchoolEmailProviderType.SMTP,
        fromName: 'Tenant B Mail',
        fromEmail: 'mail-b@settings-tenancy.moazez.local',
        host: 'smtp-b.settings-tenancy.moazez.local',
        port: 465,
        secure: true,
        username: 'mail-b@settings-tenancy.moazez.local',
        encryptedPassword: 'redacted-tenant-b-secret',
        status: SchoolEmailConnectionStatus.ACTIVE,
        failureReason: null,
      },
      create: {
        schoolId: tenantBSchoolId,
        providerType: SchoolEmailProviderType.SMTP,
        fromName: 'Tenant B Mail',
        fromEmail: 'mail-b@settings-tenancy.moazez.local',
        host: 'smtp-b.settings-tenancy.moazez.local',
        port: 465,
        secure: true,
        username: 'mail-b@settings-tenancy.moazez.local',
        encryptedPassword: 'redacted-tenant-b-secret',
        status: SchoolEmailConnectionStatus.ACTIVE,
      },
    });

    await prisma.schoolEmailTemplate.upsert({
      where: {
        schoolId_key: {
          schoolId: tenantBSchoolId,
          key: SchoolEmailTemplateKey.GENERAL_MESSAGE,
        },
      },
      update: {
        subject: 'Tenant B private subject',
        bodyHtml: '<p>Tenant B private body</p>',
      },
      create: {
        schoolId: tenantBSchoolId,
        key: SchoolEmailTemplateKey.GENERAL_MESSAGE,
        subject: 'Tenant B private subject',
        bodyHtml: '<p>Tenant B private body</p>',
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

    const existingRoleB = await prisma.role.findUnique({
      where: {
        schoolId_key: {
          schoolId: schoolB.id,
          key: 'settings_tenancy_role_b',
        },
      },
      select: { id: true },
    });

    if (existingRoleB) {
      tenantBRoleId = existingRoleB.id;
      await prisma.rolePermission.deleteMany({
        where: { roleId: existingRoleB.id },
      });
      await prisma.role.update({
        where: { id: existingRoleB.id },
        data: {
          name: 'Settings Tenancy Role B',
          description: 'Tenant B scoped custom role',
          isSystem: false,
        },
      });
    } else {
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
      const cleanupSchoolIds = [demoSchoolId, tenantBSchoolId].filter(
        (schoolId): schoolId is string => Boolean(schoolId),
      );

      if (cleanupSchoolIds.length > 0) {
        await prisma.schoolEmailDeliveryRecipient.deleteMany({
          where: { schoolId: { in: cleanupSchoolIds } },
        });
        await prisma.schoolEmailDeliveryBatch.deleteMany({
          where: { schoolId: { in: cleanupSchoolIds } },
        });
        await prisma.schoolEmailTemplate.deleteMany({
          where: { schoolId: { in: cleanupSchoolIds } },
        });
        await prisma.schoolEmailConnection.deleteMany({
          where: { schoolId: { in: cleanupSchoolIds } },
        });
        await prisma.schoolLoginSettings.deleteMany({
          where: { schoolId: { in: cleanupSchoolIds } },
        });
      }
      await prisma.user.deleteMany({
        where: {
          email: {
            in: [DEMO_GENERATED_LOGIN_EMAIL, TENANT_B_GENERATED_LOGIN_EMAIL],
          },
        },
      });
      if (demoCredentialUserId) {
        await prisma.membership.deleteMany({
          where: { userId: demoCredentialUserId },
        });
        await prisma.user.deleteMany({ where: { id: demoCredentialUserId } });
      }
      if (demoViewerUserId) {
        await prisma.membership.deleteMany({
          where: { userId: demoViewerUserId },
        });
        await prisma.user.deleteMany({ where: { id: demoViewerUserId } });
      }
      if (demoViewerRoleId) {
        await prisma.rolePermission.deleteMany({
          where: { roleId: demoViewerRoleId },
        });
        await prisma.role.deleteMany({ where: { id: demoViewerRoleId } });
      }
      if (createdGranularPermissionUserIds.length > 0) {
        await prisma.session.deleteMany({
          where: { userId: { in: createdGranularPermissionUserIds } },
        });
        await prisma.membership.deleteMany({
          where: { userId: { in: createdGranularPermissionUserIds } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: createdGranularPermissionUserIds } },
        });
      }
      if (createdGranularPermissionRoleIds.length > 0) {
        await prisma.rolePermission.deleteMany({
          where: { roleId: { in: createdGranularPermissionRoleIds } },
        });
        await prisma.role.deleteMany({
          where: { id: { in: createdGranularPermissionRoleIds } },
        });
      }
      if (tenantBRoleId) {
        await prisma.rolePermission.deleteMany({
          where: { roleId: tenantBRoleId },
        });
        await prisma.role.deleteMany({ where: { id: tenantBRoleId } });
      }
      if (tenantBSchoolId) {
        await prisma.securitySetting.deleteMany({
          where: { schoolId: tenantBSchoolId },
        });
        await prisma.schoolProfile.deleteMany({
          where: { schoolId: tenantBSchoolId },
        });
      }
      if (tenantBUserId) {
        await prisma.membership.deleteMany({
          where: { userId: tenantBUserId },
        });
        await prisma.user.deleteMany({ where: { id: tenantBUserId } });
      }
      if (tenantBSchoolId) {
        await prisma.school.deleteMany({ where: { id: tenantBSchoolId } });
      }
      await prisma.organization.deleteMany({
        where: { slug: TENANT_B_ORG_SLUG },
      });
      await prisma.$disconnect();
    }
  });

  async function login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; body: Record<string, unknown> }> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password })
      .expect(200);

    return { accessToken: response.body.accessToken, body: response.body };
  }

  async function ensureSihPermissionsForSchoolAdmin(
    schoolAdminRoleId: string,
  ): Promise<void> {
    for (const permission of SIH_PERMISSION_SEEDS) {
      await prisma.permission.upsert({
        where: { code: permission.code },
        update: permission,
        create: permission,
      });
    }

    const permissions = await prisma.permission.findMany({
      where: { code: { in: SIH_SCHOOL_ADMIN_PERMISSION_CODES } },
      select: { id: true },
    });

    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: schoolAdminRoleId,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  }

  async function createGranularPermissionUser(params: {
    key: string;
    email: string;
    permissionCodes: string[];
  }): Promise<{ accessToken: string; userId: string; roleId: string }> {
    const role = await prisma.role.create({
      data: {
        schoolId: demoSchoolId,
        key: params.key,
        name: params.key.replace(/_/g, ' '),
        isSystem: false,
      },
      select: { id: true },
    });
    createdGranularPermissionRoleIds.push(role.id);

    const permissions = await prisma.permission.findMany({
      where: { code: { in: params.permissionCodes } },
      select: { id: true },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: role.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });

    const user = await prisma.user.create({
      data: {
        email: params.email,
        firstName: 'Granular',
        lastName: 'Permission',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(
          GRANULAR_EMAIL_TEST_PASSWORD,
          ARGON2_OPTIONS,
        ),
      },
      select: { id: true },
    });
    createdGranularPermissionUserIds.push(user.id);

    await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        roleId: role.id,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
      },
    });

    const { accessToken } = await login(
      params.email,
      GRANULAR_EMAIL_TEST_PASSWORD,
    );

    return { accessToken, userId: user.id, roleId: role.id };
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

  it('requires explicit permission catalog access for settings permissions', async () => {
    const admin = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const viewer = await login(DEMO_VIEWER_EMAIL, DEMO_VIEWER_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/permissions`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'settings.permissions.view',
          module: 'settings',
          resource: 'permissions',
          action: 'view',
        }),
      ]),
    );
    expect(JSON.stringify(response.body)).not.toContain('schoolId');
    expect(JSON.stringify(response.body)).not.toContain('organizationId');

    const rejected = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/permissions`)
      .set('Authorization', `Bearer ${viewer.accessToken}`)
      .expect(403);

    expect(rejected.body?.error?.code).toBe('auth.scope.missing');
  });

  it('requires auth for school login identity settings', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/login-identity`)
      .expect(401);
  });

  it('requires auth for credential status list', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/users/credentials/status`)
      .expect(401);
  });

  it('school admin can configure own school login domain without tenant ids in response', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/settings/login-identity`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        loginDomain: DEMO_LOGIN_DOMAIN,
        usernameMinLength: 3,
        usernameMaxLength: 40,
        reservedUsernames: ['registrar'],
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        configured: true,
        loginDomain: DEMO_LOGIN_DOMAIN,
        usernameMinLength: 3,
        usernameMaxLength: 40,
        status: 'active',
      }),
    );
    expect(response.body).not.toHaveProperty('schoolId');
    expect(response.body).not.toHaveProperty('organizationId');
  });

  it('previews generated login email for the current school domain', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/settings/login-identity`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ loginDomain: DEMO_LOGIN_DOMAIN })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/login-identity/preview`)
      .query({ username: 'Ahmed.Ali' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toEqual({
      username: 'ahmed.ali',
      loginEmail: `ahmed.ali@${DEMO_LOGIN_DOMAIN}`,
    });
  });

  it('isolates school login identity settings by current school', async () => {
    const { accessToken } = await login(
      TENANT_B_ADMIN_EMAIL,
      TENANT_B_ADMIN_PASSWORD,
    );

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/login-identity`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.loginDomain).toBe(TENANT_B_LOGIN_DOMAIN);
    expect(response.body.loginDomain).not.toBe(DEMO_LOGIN_DOMAIN);
    expect(response.body).not.toHaveProperty('schoolId');
    expect(response.body).not.toHaveProperty('organizationId');
  });

  it('requires auth for settings email routes', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/connection`)
      .expect(401);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/templates`)
      .expect(401);
  });

  it('does not allow broad settings security permissions to manage email routes', async () => {
    const suffix = Date.now();
    const { accessToken } = await createGranularPermissionUser({
      key: `settings_security_only_${suffix}`,
      email: `security-only-${suffix}@settings-tenancy.moazez.local`,
      permissionCodes: ['settings.security.view', 'settings.security.manage'],
    });

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/settings/email/connection`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        providerType: 'SMTP',
        fromName: 'Security Only',
        fromEmail: `security-only-${suffix}@settings-tenancy.moazez.local`,
        host: 'smtp-security-only.settings-tenancy.moazez.local',
        port: 587,
        secure: false,
        username: `security-only-${suffix}`,
        password: 'SecurityOnlySmtp123!',
      })
      .expect(403);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/settings/email/credential-deliveries/preview-recipients`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ scope: 'selected', userIds: [demoCredentialUserId] })
      .expect(403);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/deliveries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/campaigns/preview`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ subject: 'Nope', bodyHtml: '<p>Nope</p>' })
      .expect(403);
  });

  it('enforces granular email connection view and manage permissions', async () => {
    const suffix = Date.now();
    const viewOnly = await createGranularPermissionUser({
      key: `email_connection_view_${suffix}`,
      email: `email-view-${suffix}@settings-tenancy.moazez.local`,
      permissionCodes: ['settings.email.connection.view'],
    });

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/connection`)
      .set('Authorization', `Bearer ${viewOnly.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/settings/email/connection`)
      .set('Authorization', `Bearer ${viewOnly.accessToken}`)
      .send({
        providerType: 'SMTP',
        fromName: 'View Only',
        fromEmail: `view-only-${suffix}@settings-tenancy.moazez.local`,
        host: 'smtp-view-only.settings-tenancy.moazez.local',
        port: 587,
        secure: false,
        username: `view-only-${suffix}`,
        password: 'ViewOnlySmtp123!',
      })
      .expect(403);

    const manage = await createGranularPermissionUser({
      key: `email_connection_manage_${suffix}`,
      email: `email-manage-${suffix}@settings-tenancy.moazez.local`,
      permissionCodes: ['settings.email.connection.manage'],
    });

    const updated = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/settings/email/connection`)
      .set('Authorization', `Bearer ${manage.accessToken}`)
      .send({
        providerType: 'SMTP',
        fromName: 'Manage Only',
        fromEmail: `manage-only-${suffix}@settings-tenancy.moazez.local`,
        host: 'smtp-manage-only.settings-tenancy.moazez.local',
        port: 587,
        secure: false,
        username: `manage-only-${suffix}`,
        password: 'ManageOnlySmtp123!',
      })
      .expect(200);

    expect(updated.body).toEqual(
      expect.objectContaining({
        configured: true,
        providerType: 'SMTP',
        hasPassword: true,
      }),
    );
    expect(JSON.stringify(updated.body)).not.toContain('ManageOnlySmtp123!');
  });

  it('school admin can configure test activate and disable own school email connection without exposing secrets', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const updated = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/settings/email/connection`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        providerType: 'SMTP',
        fromName: 'Demo School Mail',
        fromEmail: 'mail-a@settings-tenancy.moazez.local',
        replyToEmail: 'reply-a@settings-tenancy.moazez.local',
        host: 'smtp-a.settings-tenancy.moazez.local',
        port: 587,
        secure: false,
        username: 'mail-a@settings-tenancy.moazez.local',
        password: 'smtp-secret-11d',
      })
      .expect(200);

    expect(updated.body).toEqual(
      expect.objectContaining({
        configured: true,
        providerType: 'SMTP',
        status: 'DRAFT',
        hasPassword: true,
      }),
    );
    expect(JSON.stringify(updated.body)).not.toContain('smtp-secret-11d');
    expect(updated.body).not.toHaveProperty('encryptedPassword');
    expect(updated.body).not.toHaveProperty('encryptedApiKey');
    expect(updated.body).not.toHaveProperty('schoolId');
    expect(updated.body).not.toHaveProperty('organizationId');

    const tested = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/connection/test`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ toEmail: 'test-recipient@example.com' })
      .expect(201);

    expect(tested.body).toEqual(
      expect.objectContaining({
        status: 'VERIFIED',
        testRecipient: 'test-recipient@example.com',
        deliveryMode: 'configuration_validation',
      }),
    );

    const activated = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/connection/activate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(activated.body.status).toBe('ACTIVE');

    const disabled = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/connection/disable`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(disabled.body.status).toBe('DISABLED');

    const auditEntries = await prisma.auditLog.findMany({
      where: {
        schoolId: demoSchoolId,
        action: {
          in: [
            'settings.email.connection.create',
            'settings.email.connection.test',
            'settings.email.connection.activate',
            'settings.email.connection.disable',
          ],
        },
      },
      select: { before: true, after: true },
    });

    expect(JSON.stringify(auditEntries)).not.toContain('smtp-secret-11d');
  });

  it('isolates school email connection settings by current school', async () => {
    const demoAdmin = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const tenantBAdmin = await login(
      TENANT_B_ADMIN_EMAIL,
      TENANT_B_ADMIN_PASSWORD,
    );

    const schoolA = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/connection`)
      .set('Authorization', `Bearer ${demoAdmin.accessToken}`)
      .expect(200);
    const schoolB = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/connection`)
      .set('Authorization', `Bearer ${tenantBAdmin.accessToken}`)
      .expect(200);

    expect(schoolB.body.host).toBe('smtp-b.settings-tenancy.moazez.local');
    expect(schoolB.body.host).not.toBe(schoolA.body.host);
    expect(JSON.stringify(schoolB.body)).not.toContain('schoolId');
    expect(JSON.stringify(schoolB.body)).not.toContain('encryptedPassword');
  });

  it('rejects bulk-recipient payloads on the bounded email connection test route', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/connection/test`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ recipients: ['one@example.com', 'two@example.com'] })
      .expect(400);

    expect(response.body?.error?.code).toBe('validation.failed');
  });

  it('returns default school email templates and isolates customized tenant templates', async () => {
    const demoAdmin = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
    const tenantBAdmin = await login(
      TENANT_B_ADMIN_EMAIL,
      TENANT_B_ADMIN_PASSWORD,
    );

    const defaults = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/templates/ACCOUNT_CREDENTIALS`)
      .set('Authorization', `Bearer ${demoAdmin.accessToken}`)
      .expect(200);

    expect(defaults.body.customized).toBe(false);
    expect(defaults.body.allowedVariables).toEqual(
      expect.arrayContaining([
        'credential.activationUrl',
        'credential.temporaryPassword',
      ]),
    );
    expect(defaults.body).not.toHaveProperty('schoolId');
    expect(defaults.body).not.toHaveProperty('organizationId');

    const tenantTemplate = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/templates/GENERAL_MESSAGE`)
      .set('Authorization', `Bearer ${tenantBAdmin.accessToken}`)
      .expect(200);

    expect(tenantTemplate.body.subject).toBe('Tenant B private subject');
    expect(tenantTemplate.body.subject).not.toBe(defaults.body.subject);
  });

  it('updates previews and resets school email templates without persisting preview output', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const updated = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/settings/email/templates/GENERAL_MESSAGE`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        subject: 'Hello {{user.fullName}}',
        title: '{{school.name}} notice',
        bodyHtml: '<p>Login email: {{user.loginEmail}}</p>',
        bodyText: 'Login email: {{user.loginEmail}}',
        supportEmail: 'support-a@settings-tenancy.moazez.local',
        socialLinks: { website: 'https://school-a.example' },
      })
      .expect(200);

    expect(updated.body.customized).toBe(true);
    expect(updated.body.socialLinks).toEqual({
      website: 'https://school-a.example',
    });

    const beforeCount = await prisma.schoolEmailTemplate.count({
      where: { schoolId: demoSchoolId },
    });

    const preview = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/templates/GENERAL_MESSAGE/preview`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        subject: 'Hello {{user.fullName}} {{system.secret}}',
        bodyHtml: '<p>{{user.loginEmail}}</p><p>{{support.phone}}</p>',
        previewData: {
          user: { fullName: 'Preview Admin', loginEmail: 'admin@example.com' },
          support: { phone: null },
        },
      })
      .expect(201);

    expect(preview.body.subject).toContain('Preview Admin');
    expect(preview.body.unknownVariables).toContain('system.secret');
    expect(preview.body.missingVariables).toContain('support.phone');

    await expect(
      prisma.schoolEmailTemplate.count({ where: { schoolId: demoSchoolId } }),
    ).resolves.toBe(beforeCount);

    const reset = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/settings/email/templates/GENERAL_MESSAGE/reset-default`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(reset.body.customized).toBe(false);
  });

  it('returns 403 when a role without manage permission updates settings email resources', async () => {
    const { accessToken } = await login(
      DEMO_VIEWER_EMAIL,
      DEMO_VIEWER_PASSWORD,
    );

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/settings/email/connection`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fromName: 'Viewer',
        fromEmail: 'viewer@example.com',
        host: 'smtp.example.com',
        port: 587,
        username: 'viewer@example.com',
      })
      .expect(403);

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/settings/email/templates/GENERAL_MESSAGE`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ subject: 'Nope', bodyHtml: '<p>Nope</p>' })
      .expect(403);
  });

  it('requires auth for credential delivery and campaign routes', async () => {
    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/settings/email/credential-deliveries/preview-recipients`,
      )
      .expect(401);

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/deliveries`)
      .expect(401);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/campaigns/preview-recipients`)
      .expect(401);

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/campaigns`)
      .expect(401);
  });

  it('previews credential delivery recipients with safe contact-email targeting', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const missingContact = await prisma.user.create({
      data: {
        email: 'missing-contact@settings-tenancy.moazez.local',
        firstName: 'Missing',
        lastName: 'Contact',
        username: 'missing.contact',
        contactEmail: null,
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    await prisma.membership.create({
      data: {
        userId: missingContact.id,
        organizationId: demoOrganizationId,
        schoolId: demoSchoolId,
        roleId: demoViewerRoleId,
        userType: UserType.SCHOOL_USER,
        status: MembershipStatus.ACTIVE,
      },
    });

    const preview = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/settings/email/credential-deliveries/preview-recipients`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        scope: 'selected',
        userIds: [demoCredentialUserId, missingContact.id, tenantBUserId],
        includeUsersWithPassword: true,
        requireContactEmail: true,
      })
      .expect(201);

    expect(preview.body.totalMatched).toBe(2);
    expect(preview.body.eligible).toBe(1);
    expect(preview.body.skippedReasons).toEqual({ missing_contact_email: 1 });
    expect(JSON.stringify(preview.body)).not.toContain('passwordHash');
    expect(JSON.stringify(preview.body)).not.toContain('schoolId');
    expect(JSON.stringify(preview.body)).not.toContain('organizationId');

    await prisma.membership.deleteMany({
      where: { userId: missingContact.id },
    });
    await prisma.user.delete({ where: { id: missingContact.id } });
  });

  it('queues credential delivery and general campaigns without communication side effects', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await prisma.schoolEmailConnection.upsert({
      where: { schoolId: demoSchoolId },
      update: {
        providerType: SchoolEmailProviderType.SMTP,
        fromName: 'Demo Mail',
        fromEmail: 'mail-a@settings-tenancy.moazez.local',
        host: 'smtp-a.settings-tenancy.moazez.local',
        port: 587,
        secure: false,
        username: 'mail-a@settings-tenancy.moazez.local',
        encryptedPassword: 'redacted-demo-secret',
        status: SchoolEmailConnectionStatus.ACTIVE,
        failureReason: null,
      },
      create: {
        schoolId: demoSchoolId,
        providerType: SchoolEmailProviderType.SMTP,
        fromName: 'Demo Mail',
        fromEmail: 'mail-a@settings-tenancy.moazez.local',
        host: 'smtp-a.settings-tenancy.moazez.local',
        port: 587,
        secure: false,
        username: 'mail-a@settings-tenancy.moazez.local',
        encryptedPassword: 'redacted-demo-secret',
        status: SchoolEmailConnectionStatus.ACTIVE,
      },
    });

    const announcementCountBefore =
      await prisma.communicationAnnouncement.count({
        where: { schoolId: demoSchoolId },
      });
    const notificationCountBefore =
      await prisma.communicationNotification.count({
        where: { schoolId: demoSchoolId },
      });

    const credential = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/credential-deliveries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        scope: 'selected',
        userIds: [demoCredentialUserId],
        includeUsersWithPassword: true,
        credentialMode: 'LOGIN_INFO_ONLY',
      })
      .expect(201);

    expect(credential.body).toEqual(
      expect.objectContaining({
        kind: SchoolEmailDeliveryKind.CREDENTIAL_DELIVERY,
        status: SchoolEmailDeliveryBatchStatus.QUEUED,
        totalRecipients: 1,
        queuedCount: 1,
        deliveryMode: 'queued',
      }),
    );
    expect(JSON.stringify(credential.body)).not.toContain('passwordHash');
    expect(JSON.stringify(credential.body)).not.toMatch(/MZ-/);
    expect(credential.body).not.toHaveProperty('schoolId');
    expect(credential.body).not.toHaveProperty('organizationId');

    const campaign = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/campaigns`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        recipientScope: { scope: 'selected', userIds: [demoCredentialUserId] },
        subject: 'Security update',
        bodyHtml: '<p>Hello {{user.fullName}}</p>',
      })
      .expect(201);

    expect(campaign.body.kind).toBe(SchoolEmailDeliveryKind.GENERAL_CAMPAIGN);
    expect(campaign.body.deliveryMode).toBe('queued');

    await expect(
      prisma.communicationAnnouncement.count({
        where: { schoolId: demoSchoolId },
      }),
    ).resolves.toBe(announcementCountBefore);
    await expect(
      prisma.communicationNotification.count({
        where: { schoolId: demoSchoolId },
      }),
    ).resolves.toBe(notificationCountBefore);
  });

  it('rejects credential variables in general email campaigns', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/campaigns/preview`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        subject: 'Forbidden',
        bodyHtml: '<p>{{credential.temporaryPassword}}</p>',
      })
      .expect(422);

    expect(response.body?.error?.code).toBe(
      'settings.email.campaign_credential_variables_forbidden',
    );
  });

  it('lists reads and cancels delivery batches with tenant-scoped sanitized responses', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const batchA = await prisma.schoolEmailDeliveryBatch.create({
      data: {
        schoolId: demoSchoolId,
        kind: SchoolEmailDeliveryKind.GENERAL_CAMPAIGN,
        status: SchoolEmailDeliveryBatchStatus.QUEUED,
        templateKey: SchoolEmailTemplateKey.GENERAL_MESSAGE,
        subjectSnapshot: 'Batch A',
        totalRecipients: 1,
        queuedCount: 1,
      },
    });
    await prisma.schoolEmailDeliveryRecipient.create({
      data: {
        schoolId: demoSchoolId,
        batchId: batchA.id,
        recipientType: SchoolEmailDeliveryRecipientType.USER,
        userId: demoCredentialUserId,
        toEmail: 'credential.contact@example.com',
        displayName: 'Credential Target',
        status: SchoolEmailDeliveryRecipientStatus.QUEUED,
      },
    });

    const batchB = await prisma.schoolEmailDeliveryBatch.create({
      data: {
        schoolId: tenantBSchoolId,
        kind: SchoolEmailDeliveryKind.GENERAL_CAMPAIGN,
        status: SchoolEmailDeliveryBatchStatus.QUEUED,
        templateKey: SchoolEmailTemplateKey.GENERAL_MESSAGE,
        subjectSnapshot: 'Tenant B Private',
        totalRecipients: 1,
        queuedCount: 1,
      },
    });
    const credentialBatch = await prisma.schoolEmailDeliveryBatch.create({
      data: {
        schoolId: demoSchoolId,
        kind: SchoolEmailDeliveryKind.CREDENTIAL_DELIVERY,
        status: SchoolEmailDeliveryBatchStatus.QUEUED,
        templateKey: SchoolEmailTemplateKey.ACCOUNT_CREDENTIALS,
        subjectSnapshot: 'Credential Delivery',
        totalRecipients: 1,
        queuedCount: 1,
      },
    });

    const list = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/deliveries`)
      .query({ kind: SchoolEmailDeliveryKind.GENERAL_CAMPAIGN })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(JSON.stringify(list.body)).toContain(batchA.id);
    expect(JSON.stringify(list.body)).not.toContain(batchB.id);
    expect(JSON.stringify(list.body)).not.toContain('schoolId');
    expect(JSON.stringify(list.body)).not.toContain('organizationId');

    const campaignDetail = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/campaigns/${batchA.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(campaignDetail.body.kind).toBe(
      SchoolEmailDeliveryKind.GENERAL_CAMPAIGN,
    );

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/deliveries/${credentialBatch.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const wrongKind = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/campaigns/${credentialBatch.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(wrongKind.body?.error?.code).toBe(
      'settings.email.delivery_batch_not_found',
    );

    const recipients = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/deliveries/${batchA.id}/recipients`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(recipients.body.items[0]).toEqual(
      expect.objectContaining({
        userId: demoCredentialUserId,
        toEmail: 'credential.contact@example.com',
        status: SchoolEmailDeliveryRecipientStatus.QUEUED,
      }),
    );
    expect(JSON.stringify(recipients.body)).not.toContain('passwordHash');

    const cancelled = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/deliveries/${batchA.id}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(cancelled.body.status).toBe(
      SchoolEmailDeliveryBatchStatus.CANCELLED,
    );

    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/email/deliveries/${batchB.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('returns 403 when a role without manage permission creates or cancels email delivery', async () => {
    const { accessToken } = await login(
      DEMO_VIEWER_EMAIL,
      DEMO_VIEWER_PASSWORD,
    );

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/credential-deliveries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        scope: 'selected',
        userIds: [demoCredentialUserId],
        credentialMode: 'LOGIN_INFO_ONLY',
      })
      .expect(403);

    const batch = await prisma.schoolEmailDeliveryBatch.create({
      data: {
        schoolId: demoSchoolId,
        kind: SchoolEmailDeliveryKind.GENERAL_CAMPAIGN,
        status: SchoolEmailDeliveryBatchStatus.QUEUED,
        totalRecipients: 0,
      },
    });

    await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/email/deliveries/${batch.id}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('checks username availability against the current school generated domain', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/settings/login-identity`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ loginDomain: DEMO_LOGIN_DOMAIN })
      .expect(200);

    await prisma.user.upsert({
      where: { email: TENANT_B_GENERATED_LOGIN_EMAIL },
      update: {
        firstName: 'Tenant',
        lastName: 'Generated',
        username: 'taken.identity',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
      },
      create: {
        email: TENANT_B_GENERATED_LOGIN_EMAIL,
        firstName: 'Tenant',
        lastName: 'Generated',
        username: 'taken.identity',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
      },
    });

    const available = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/users/usernames/available`)
      .query({ username: 'taken.identity' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(available.body).toEqual({
      username: 'taken.identity',
      loginEmail: DEMO_GENERATED_LOGIN_EMAIL,
      available: true,
      reason: null,
    });

    await prisma.user.upsert({
      where: { email: DEMO_GENERATED_LOGIN_EMAIL },
      update: {
        firstName: 'Demo',
        lastName: 'Generated',
        username: 'taken.identity',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
      },
      create: {
        email: DEMO_GENERATED_LOGIN_EMAIL,
        firstName: 'Demo',
        lastName: 'Generated',
        username: 'taken.identity',
        userType: UserType.SCHOOL_USER,
        status: UserStatus.ACTIVE,
      },
    });

    const unavailable = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/users/usernames/available`)
      .query({ username: 'taken.identity' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(unavailable.body).toEqual({
      username: 'taken.identity',
      loginEmail: DEMO_GENERATED_LOGIN_EMAIL,
      available: false,
      reason: 'login_email_taken',
    });
  });

  it('returns 403 when non-admin role tries to manage login identity', async () => {
    const { accessToken } = await login(
      DEMO_VIEWER_EMAIL,
      DEMO_VIEWER_PASSWORD,
    );

    const response = await request(app.getHttpServer())
      .put(`${GLOBAL_PREFIX}/settings/login-identity`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ loginDomain: 'viewer.moazez.test' })
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('returns 403 when non-manage role tries to generate credentials', async () => {
    const { accessToken } = await login(
      DEMO_VIEWER_EMAIL,
      DEMO_VIEWER_PASSWORD,
    );

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/settings/users/${demoCredentialUserId}/credentials/generate`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });

  it('generates, sets, and regenerates current-school credentials safely', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const generated = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/settings/users/${demoCredentialUserId}/credentials/generate`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(generated.body.temporaryPassword).toMatch(/^MZ-/);
    expect(generated.body.user).toEqual(
      expect.objectContaining({
        userId: demoCredentialUserId,
        mustChangePassword: true,
        status: 'temporary_or_must_change',
      }),
    );
    expect(generated.body.user).not.toHaveProperty('passwordHash');
    expect(generated.body.user).not.toHaveProperty('schoolId');
    expect(generated.body.user).not.toHaveProperty('organizationId');

    const set = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/settings/users/${demoCredentialUserId}/credentials/set`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        password: CREDENTIAL_TARGET_PASSWORD,
        forceResetOnLogin: false,
      })
      .expect(201);

    expect(set.body).not.toHaveProperty('temporaryPassword');
    expect(set.body.mustChangePassword).toBe(false);
    expect(set.body.user.status).toBe('set');

    const regenerated = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/settings/users/${demoCredentialUserId}/credentials/regenerate`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(regenerated.body.temporaryPassword).toMatch(/^MZ-/);
    expect(regenerated.body.user.mustChangePassword).toBe(true);

    const auditEntries = await prisma.auditLog.findMany({
      where: {
        action: {
          in: [
            'iam.credentials.generate',
            'iam.credentials.set',
            'iam.credentials.regenerate',
          ],
        },
        resourceId: demoCredentialUserId,
      },
      select: { after: true },
    });
    const auditPayload = JSON.stringify(auditEntries);

    expect(auditPayload).not.toContain(CREDENTIAL_TARGET_PASSWORD);
    expect(auditPayload).not.toContain(generated.body.temporaryPassword);
    expect(auditPayload).not.toContain(regenerated.body.temporaryPassword);
  });

  it('lists credential status without hashes or tenant ids', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/settings/users/credentials/status`)
      .query({ search: 'credential.target' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toEqual(
      expect.objectContaining({
        userId: demoCredentialUserId,
        username: 'credential.target',
      }),
    );
    expect(response.body.items[0]).not.toHaveProperty('passwordHash');
    expect(response.body.items[0]).not.toHaveProperty('schoolId');
    expect(response.body.items[0]).not.toHaveProperty('organizationId');
  });

  it('bulk previews and generates only current-school selected users', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const preview = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/users/credentials/bulk-preview`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        scope: 'selected',
        userIds: [demoCredentialUserId, tenantBUserId],
        includeUsersWithPassword: true,
      })
      .expect(201);

    expect(preview.body.totalMatched).toBe(1);
    expect(preview.body.eligible).toBe(1);

    const generated = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/settings/users/credentials/bulk-generate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        scope: 'selected',
        userIds: [demoCredentialUserId, tenantBUserId],
        includeUsersWithPassword: true,
      })
      .expect(201);

    expect(generated.body.generated).toBe(1);
    expect(generated.body.items).toHaveLength(1);
    expect(generated.body.items[0].user.userId).toBe(demoCredentialUserId);
    expect(generated.body.items[0].temporaryPassword).toMatch(/^MZ-/);
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

  it('returns 404 when school A tries to manage school B credentials', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    const response = await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/settings/users/${tenantBUserId}/credentials/generate`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(response.body?.error?.code).toBe('not_found');
  });

  it('login response includes credential metadata and change-password clears the flag', async () => {
    const { accessToken } = await login(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/settings/users/${demoCredentialUserId}/credentials/set`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        password: CREDENTIAL_TARGET_PASSWORD,
        forceResetOnLogin: true,
      })
      .expect(201);

    const targetLogin = await login(
      CREDENTIAL_TARGET_EMAIL,
      CREDENTIAL_TARGET_PASSWORD,
    );

    expect(targetLogin.body.user).toEqual(
      expect.objectContaining({
        id: demoCredentialUserId,
        username: 'credential.target',
        loginEmail: CREDENTIAL_TARGET_EMAIL,
        contactEmail: 'credential.contact@example.com',
        mustChangePassword: true,
      }),
    );

    const rejected = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/change-password`)
      .set('Authorization', `Bearer ${targetLogin.accessToken}`)
      .send({
        currentPassword: 'WrongPassword123!',
        newPassword: CREDENTIAL_TARGET_NEW_PASSWORD,
      })
      .expect(401);

    expect(rejected.body?.error?.code).toBe(
      'iam.credentials.current_password_invalid',
    );

    const changed = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/change-password`)
      .set('Authorization', `Bearer ${targetLogin.accessToken}`)
      .send({
        currentPassword: CREDENTIAL_TARGET_PASSWORD,
        newPassword: CREDENTIAL_TARGET_NEW_PASSWORD,
      })
      .expect(200);

    expect(changed.body).toEqual({
      success: true,
      mustChangePassword: false,
    });

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: demoCredentialUserId },
      select: { mustChangePassword: true, passwordChangedAt: true },
    });
    expect(stored.mustChangePassword).toBe(false);
    expect(stored.passwordChangedAt).toBeInstanceOf(Date);
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
    const { accessToken } = await login(
      DEMO_VIEWER_EMAIL,
      DEMO_VIEWER_PASSWORD,
    );

    const response = await request(app.getHttpServer())
      .patch(`${GLOBAL_PREFIX}/settings/security`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ enforceTwoFactor: true })
      .expect(403);

    expect(response.body?.error?.code).toBe('auth.scope.missing');
  });
});
