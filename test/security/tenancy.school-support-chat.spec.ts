import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
import { PLATFORM_SCOPE_METADATA } from '../../src/common/decorators/platform-scope.decorator';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { AppModule } from '../../src/app.module';
import { BullmqService } from '../../src/infrastructure/queue/bullmq.service';
import { PlatformSupportController } from '../../src/modules/school-support/controller/platform-support.controller';
import { SchoolSupportController } from '../../src/modules/school-support/controller/school-support.controller';

const GLOBAL_PREFIX = '/api/v1';
const TEST_PREFIX = `school-support-security-${Date.now()}`;
const PASSWORD = 'SchoolSupportSecurity1A!';

const SUPPORT_PERMISSIONS = [
  {
    code: 'school.support.view',
    module: 'school',
    resource: 'support',
    action: 'view',
    description: "View the current school's support conversation and messages.",
  },
  {
    code: 'school.support.send',
    module: 'school',
    resource: 'support',
    action: 'send',
    description: "Send messages in the current school's support conversation.",
  },
  {
    code: 'platform.support.view',
    module: 'platform',
    resource: 'support',
    action: 'view',
    description:
      'View Platform Admin school support inbox, conversations, and messages.',
  },
  {
    code: 'platform.support.reply',
    module: 'platform',
    resource: 'support',
    action: 'reply',
    description: 'Reply to school support conversations as Moazez Support.',
  },
  {
    code: 'platform.support.manage',
    module: 'platform',
    resource: 'support',
    action: 'manage',
    description: 'Close and reopen school support conversations.',
  },
];

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
};

jest.setTimeout(90000);

describe('School support chat tenancy and IAM contracts', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let organizationId: string;
  let schoolId: string;
  let schoolAdminEmail: string;
  let platformEmail: string;
  let schoolAdminToken: string;
  let platformToken: string;
  let conversationId: string;

  const createdOrganizationIds: string[] = [];
  const createdSchoolIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    await ensureSupportPermissions();

    const organization = await prisma.organization.create({
      data: {
        name: `${TEST_PREFIX} Organization`,
        slug: `${TEST_PREFIX}-org`,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true },
    });
    organizationId = organization.id;
    createdOrganizationIds.push(organization.id);

    const school = await prisma.school.create({
      data: {
        organizationId,
        name: `${TEST_PREFIX} School`,
        slug: `${TEST_PREFIX}-school`,
        status: SchoolStatus.ACTIVE,
      },
      select: { id: true },
    });
    schoolId = school.id;
    createdSchoolIds.push(school.id);

    schoolAdminEmail = `${TEST_PREFIX}-school-admin@moazez.local`;
    platformEmail = `${TEST_PREFIX}-platform@moazez.local`;

    await createSystemRoleActor({
      email: schoolAdminEmail,
      userType: UserType.SCHOOL_USER,
      roleKey: 'school_admin',
    });
    await createSystemRoleActor({
      email: `${TEST_PREFIX}-teacher@moazez.local`,
      userType: UserType.TEACHER,
      roleKey: 'teacher',
    });
    await createSystemRoleActor({
      email: `${TEST_PREFIX}-parent@moazez.local`,
      userType: UserType.PARENT,
      roleKey: 'parent',
    });
    await createSystemRoleActor({
      email: `${TEST_PREFIX}-student@moazez.local`,
      userType: UserType.STUDENT,
      roleKey: 'student',
    });
    await createSystemRoleActor({
      email: `${TEST_PREFIX}-dismissal@moazez.local`,
      userType: UserType.DISMISSAL_STAFF,
      roleKey: 'dismissal_staff',
    });
    await createNoMembershipUser(platformEmail, UserType.PLATFORM_USER);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BullmqService)
      .useValue(createNoopBullmqService())
      .compile();

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

    schoolAdminToken = await login(schoolAdminEmail);
    platformToken = await login(platformEmail);

    const conversation = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/school-support/conversation`)
      .set('Authorization', `Bearer ${schoolAdminToken}`)
      .expect(200);
    conversationId = conversation.body.conversation.id;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { actorId: { in: createdUserIds } },
            { organizationId: { in: createdOrganizationIds } },
            { schoolId: { in: createdSchoolIds } },
          ],
        },
      });
      await prisma.communicationNotificationPushAttempt.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.communicationNotificationDelivery.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.communicationNotification.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.communicationMessageRead.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.communicationConversationParticipant.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.communicationMessage.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.communicationConversation.deleteMany({
        where: { schoolId: { in: createdSchoolIds } },
      });
      await prisma.session.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.membership.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.school.deleteMany({
        where: { id: { in: createdSchoolIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrganizationIds } },
      });
      await prisma.$disconnect();
    }
  });

  it('guards support controllers with the sprint-specific permissions', () => {
    expect(
      Reflect.getMetadata(PLATFORM_SCOPE_METADATA, PlatformSupportController),
    ).toBe(true);
    expect(
      Reflect.getMetadata(PLATFORM_SCOPE_METADATA, SchoolSupportController),
    ).toBe(undefined);

    expect(readPermissions(SchoolSupportController, 'getConversation')).toEqual(
      ['school.support.view'],
    );
    expect(readPermissions(SchoolSupportController, 'listMessages')).toEqual([
      'school.support.view',
    ]);
    expect(readPermissions(SchoolSupportController, 'sendMessage')).toEqual([
      'school.support.send',
    ]);
    expect(readPermissions(SchoolSupportController, 'markRead')).toEqual([
      'school.support.view',
    ]);

    expect(
      readPermissions(PlatformSupportController, 'listConversations'),
    ).toEqual(['platform.support.view']);
    expect(
      readPermissions(PlatformSupportController, 'getConversation'),
    ).toEqual(['platform.support.view']);
    expect(readPermissions(PlatformSupportController, 'listMessages')).toEqual([
      'platform.support.view',
    ]);
    expect(readPermissions(PlatformSupportController, 'sendMessage')).toEqual([
      'platform.support.reply',
    ]);
    expect(readPermissions(PlatformSupportController, 'markRead')).toEqual([
      'platform.support.view',
    ]);
    expect(
      readPermissions(PlatformSupportController, 'closeConversation'),
    ).toEqual(['platform.support.manage']);
    expect(
      readPermissions(PlatformSupportController, 'reopenConversation'),
    ).toEqual(['platform.support.manage']);
  });

  it('keeps default app-role seeds out of school support permissions', () => {
    const rolesSeed = readFileSync(
      join(
        process.cwd(),
        'src/modules/iam/reference-data/system-role-catalog.ts',
      ),
      'utf8',
    );

    for (const arrayName of [
      'TEACHER_PERMISSIONS',
      'PARENT_PERMISSIONS',
      'STUDENT_PERMISSIONS',
      'DISMISSAL_STAFF_PERMISSIONS',
    ]) {
      const literal = extractArrayLiteral(rolesSeed, arrayName);
      expect(literal).not.toContain('school.support.view');
      expect(literal).not.toContain('school.support.send');
    }

    expect(rolesSeed).toContain("!code.startsWith('platform.')");
    expect(rolesSeed).toContain('permissions: ALL');
    expect(rolesSeed).toContain('permissions: SCHOOL_LEVEL');
  });

  it('denies default teacher parent student and dismissal staff school support access', async () => {
    for (const email of [
      `${TEST_PREFIX}-teacher@moazez.local`,
      `${TEST_PREFIX}-parent@moazez.local`,
      `${TEST_PREFIX}-student@moazez.local`,
      `${TEST_PREFIX}-dismissal@moazez.local`,
    ]) {
      const token = await login(email);

      await request(app.getHttpServer())
        .get(`${GLOBAL_PREFIX}/school-support/conversation`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      await request(app.getHttpServer())
        .post(`${GLOBAL_PREFIX}/school-support/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ body: 'Should not send.' })
        .expect(403);
    }
  });

  it('keeps platform support separated from generic communication routes', async () => {
    await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/support/conversations`)
      .set('Authorization', `Bearer ${schoolAdminToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/communication/conversations/${conversationId}/messages`,
      )
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ body: 'Generic communication platform reply must fail.' })
      .expect(403)
      .expect((response) => {
        expect(response.body?.error?.code).toBe('auth.scope.missing');
      });

    await request(app.getHttpServer())
      .post(
        `${GLOBAL_PREFIX}/platform-admin/support/conversations/${conversationId}/messages`,
      )
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ body: 'Wrapper reply works.' })
      .expect(201)
      .expect((response) => {
        expect(response.body).toMatchObject({
          conversationId,
          body: 'Wrapper reply works.',
          sender: {
            kind: 'support',
            displayName: 'Moazez Support',
          },
        });
      });
  });

  it('denies platform support routes when the platform role lacks required support permissions', async () => {
    await withPlatformPermissionTemporarilyRemoved(
      'platform.support.view',
      async () => {
        await request(app.getHttpServer())
          .get(`${GLOBAL_PREFIX}/platform-admin/support/conversations`)
          .set('Authorization', `Bearer ${platformToken}`)
          .expect(403);
      },
    );

    await withPlatformPermissionTemporarilyRemoved(
      'platform.support.reply',
      async () => {
        await request(app.getHttpServer())
          .post(
            `${GLOBAL_PREFIX}/platform-admin/support/conversations/${conversationId}/messages`,
          )
          .set('Authorization', `Bearer ${platformToken}`)
          .send({ body: 'Reply must require platform.support.reply.' })
          .expect(403);
      },
    );

    await withPlatformPermissionTemporarilyRemoved(
      'platform.support.manage',
      async () => {
        await request(app.getHttpServer())
          .post(
            `${GLOBAL_PREFIX}/platform-admin/support/conversations/${conversationId}/close`,
          )
          .set('Authorization', `Bearer ${platformToken}`)
          .send({ reason: 'Permission check only.' })
          .expect(403);

        await request(app.getHttpServer())
          .post(
            `${GLOBAL_PREFIX}/platform-admin/support/conversations/${conversationId}/reopen`,
          )
          .set('Authorization', `Bearer ${platformToken}`)
          .send({ reason: 'Permission check only.' })
          .expect(403);
      },
    );
  });

  it('keeps support payloads free of forbidden school and platform secrets', async () => {
    const schoolMessages = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/school-support/messages`)
      .set('Authorization', `Bearer ${schoolAdminToken}`)
      .expect(200);
    const platformInbox = await request(app.getHttpServer())
      .get(`${GLOBAL_PREFIX}/platform-admin/support/conversations`)
      .query({ schoolId })
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(200);

    const schoolPayload = JSON.stringify(schoolMessages.body);
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'participant',
      platformEmail,
      'metadata',
      'deletedAt',
      'objectKey',
      'tokenHash',
      'session',
    ]) {
      expect(schoolPayload).not.toContain(forbidden);
    }

    const platformPayload = JSON.stringify(platformInbox.body);
    for (const forbidden of [
      'passwordHash',
      'session',
      'tokenHash',
      'objectKey',
      'metadata',
      'audit',
    ]) {
      expect(platformPayload).not.toContain(forbidden);
    }
  });

  async function ensureSupportPermissions(): Promise<void> {
    for (const permission of SUPPORT_PERMISSIONS) {
      await prisma.permission.upsert({
        where: { code: permission.code },
        update: permission,
        create: permission,
      });
    }

    await ensureSystemRolePermissions('platform_super_admin', [
      'platform.support.view',
      'platform.support.reply',
      'platform.support.manage',
    ]);
    await ensureSystemRolePermissions('school_admin', [
      'school.support.view',
      'school.support.send',
    ]);
  }

  async function ensureSystemRolePermissions(
    roleKey: string,
    codes: string[],
  ): Promise<void> {
    const role = await prisma.role.findFirst({
      where: { key: roleKey, schoolId: null, isSystem: true },
      select: { id: true },
    });
    if (!role) throw new Error(`${roleKey} system role not found.`);

    const permissions = await prisma.permission.findMany({
      where: { code: { in: codes } },
      select: { id: true },
    });

    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: role.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  }

  async function withPlatformPermissionTemporarilyRemoved(
    permissionCode: string,
    callback: () => Promise<void>,
  ): Promise<void> {
    const rolePermission = await prisma.rolePermission.findFirst({
      where: {
        role: {
          key: 'platform_super_admin',
          schoolId: null,
          isSystem: true,
        },
        permission: { code: permissionCode },
      },
      select: { roleId: true, permissionId: true },
    });
    if (!rolePermission) {
      throw new Error(
        `platform_super_admin is missing expected permission ${permissionCode}`,
      );
    }

    await prisma.rolePermission.deleteMany({
      where: {
        roleId: rolePermission.roleId,
        permissionId: rolePermission.permissionId,
      },
    });

    try {
      await callback();
    } finally {
      await prisma.rolePermission.createMany({
        data: [rolePermission],
        skipDuplicates: true,
      });
    }
  }

  async function createSystemRoleActor(params: {
    email: string;
    userType: UserType;
    roleKey: string;
  }): Promise<string> {
    const role = await prisma.role.findFirst({
      where: {
        key: params.roleKey,
        schoolId: null,
        isSystem: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!role) throw new Error(`${params.roleKey} system role not found.`);

    const userId = await createNoMembershipUser(params.email, params.userType);
    await prisma.membership.create({
      data: {
        userId,
        organizationId,
        schoolId,
        roleId: role.id,
        userType: params.userType,
        status: MembershipStatus.ACTIVE,
      },
    });

    return userId;
  }

  async function createNoMembershipUser(
    email: string,
    userType: UserType,
  ): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email,
        firstName: userType === UserType.PLATFORM_USER ? 'Platform' : 'Support',
        lastName: 'Security',
        userType,
        status: UserStatus.ACTIVE,
        passwordHash: await argon2.hash(PASSWORD, ARGON2_OPTIONS),
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${GLOBAL_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD })
      .expect(200);

    return response.body.accessToken;
  }
});

function readPermissions(controller: Function, methodName: string): string[] {
  return Reflect.getMetadata(
    REQUIRED_PERMISSIONS_METADATA,
    controller.prototype[methodName],
  );
}

function extractArrayLiteral(source: string, arrayName: string): string {
  const match = source.match(
    new RegExp(`const ${arrayName} = \\[([\\s\\S]*?)\\];`),
  );
  return match?.[1] ?? '';
}

type AppModuleBullmqServiceMock = {
  addEmailJob: (...args: unknown[]) => Promise<void>;
  addImportJob: (...args: unknown[]) => Promise<void>;
  addJob: (...args: Parameters<BullmqService['addJob']>) => Promise<void>;
  getQueueReadiness: BullmqService['getQueueReadiness'];
  createWorker: (
    ...args: Parameters<BullmqService['createWorker']>
  ) => NoopBullmqWorker;
  onModuleDestroy: BullmqService['onModuleDestroy'];
};

type NoopBullmqWorker = {
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  close: () => Promise<void>;
};

function createNoopBullmqService(): AppModuleBullmqServiceMock {
  return {
    addEmailJob: jest.fn().mockResolvedValue(undefined),
    addImportJob: jest.fn().mockResolvedValue(undefined),
    addJob: jest.fn().mockResolvedValue(undefined),
    getQueueReadiness: jest.fn().mockResolvedValue({
      name: 'settings-branding-logo-cleanup',
      status: 'ok',
      counts: { waiting: 0, active: 0, delayed: 0, failed: 0 },
    }),
    createWorker: jest.fn().mockReturnValue({
      on: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    }),
    onModuleDestroy: jest.fn().mockResolvedValue(undefined),
  };
}
