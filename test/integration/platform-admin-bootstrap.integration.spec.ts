import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  PrismaClient,
  UserStatus,
  UserType,
  type AuditLog,
} from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Env } from '../../src/config/env.validation';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { LoginUseCase } from '../../src/modules/iam/auth/application/login.use-case';
import { PasswordService } from '../../src/modules/iam/auth/domain/password.service';
import { TokenService } from '../../src/modules/iam/auth/domain/token.service';
import { AuthRepository } from '../../src/modules/iam/auth/infrastructure/auth.repository';
import { BootstrapInitialPlatformAdministratorUseCase } from '../../src/modules/platform-admin/bootstrap/bootstrap-initial-platform-administrator.use-case';
import { PLATFORM_ADMIN_ROLE_CODE } from '../../src/modules/platform-admin/bootstrap/platform-admin-bootstrap.constants';
import { PlatformAdminBootstrapError } from '../../src/modules/platform-admin/bootstrap/platform-admin-bootstrap.errors';
import { PlatformAdminBootstrapRepository } from '../../src/modules/platform-admin/bootstrap/platform-admin-bootstrap.repository';
import { PERMISSION_CODES } from '../../prisma/seeds/01-permissions.seed';

jest.setTimeout(120_000);

const DISPOSABLE_DATABASE_REQUIRED_MESSAGE =
  'Stage 20B integration requires an explicitly disposable test database';
const LOCAL_DISPOSABLE_DATABASE_PATTERN =
  /^moazez_test(?:_[a-z0-9]+(?:[_-][a-z0-9]+)*)?$/u;
const CI_DISPOSABLE_DATABASE_PATTERN = /^ci_[0-9a-f]{14}$/u;

assertDisposableIntegrationDatabase(process.env);

const TEST_MARKER = `stage20b-${randomUUID().slice(0, 12)}`;

describe('Stage 20B initial Platform Administrator bootstrap (integration)', () => {
  const prisma = new PrismaClient();
  const passwordService = new PasswordService();
  const originalPlatformUserStatuses = new Map<string, UserStatus>();

  let repository: PlatformAdminBootstrapRepository;
  let useCase: BootstrapInitialPlatformAdministratorUseCase;

  beforeAll(async () => {
    await prisma.$connect();

    const role = await prisma.role.findFirst({
      where: {
        key: PLATFORM_ADMIN_ROLE_CODE,
        schoolId: null,
        isSystem: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!role) {
      throw new Error(
        `${PLATFORM_ADMIN_ROLE_CODE} reference role is required for this integration suite`,
      );
    }

    const existingLegitimatePlatformUsers = await prisma.user.findMany({
      where: {
        userType: UserType.PLATFORM_USER,
        status: UserStatus.ACTIVE,
        passwordHash: { not: null },
        deletedAt: null,
      },
      select: { id: true, status: true },
    });
    for (const user of existingLegitimatePlatformUsers) {
      originalPlatformUserStatuses.set(user.id, user.status);
    }

    if (existingLegitimatePlatformUsers.length > 0) {
      await prisma.user.updateMany({
        where: {
          id: { in: existingLegitimatePlatformUsers.map((user) => user.id) },
        },
        data: { status: UserStatus.DISABLED },
      });
    }

    repository = new PlatformAdminBootstrapRepository(
      prisma as unknown as PrismaService,
    );
    useCase = new BootstrapInitialPlatformAdministratorUseCase(
      repository,
      passwordService,
    );
  });

  afterEach(async () => {
    await cleanTestUsers();
  });

  afterAll(async () => {
    try {
      await cleanTestUsers();
      for (const [userId, status] of originalPlatformUserStatuses) {
        await prisma.user.updateMany({
          where: { id: userId },
          data: { status },
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it('creates the first legitimate admin with the canonical role and credential implementation', async () => {
    const password = strongPassword();
    const command = validCommand('first-success', password);

    const result = await useCase.execute(command);

    expect(result).toMatchObject({
      status: 'PASS',
      platformAdminCreated: true,
      roleCode: PLATFORM_ADMIN_ROLE_CODE,
    });
    expect(typeof result.platformAdminUserId).toBe('string');

    const [user, role, auditEntries] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: result.platformAdminUserId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          userType: true,
          status: true,
          passwordHash: true,
          mustChangePassword: true,
          passwordChangedAt: true,
          passwordProvisionedAt: true,
          credentialVersion: true,
          memberships: { select: { id: true } },
        },
      }),
      loadCanonicalRole(),
      loadBootstrapAuditEntries(result.platformAdminUserId),
    ]);

    expect(user).toMatchObject({
      email: command.email,
      firstName: command.firstName,
      lastName: command.lastName,
      userType: UserType.PLATFORM_USER,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
      credentialVersion: 1,
      memberships: [],
    });
    expect(user.passwordChangedAt).toBeInstanceOf(Date);
    expect(user.passwordProvisionedAt).toBeInstanceOf(Date);
    expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/u);
    await expect(
      passwordService.verify(user.passwordHash!, password),
    ).resolves.toBe(true);

    expect(role.key).toBe(PLATFORM_ADMIN_ROLE_CODE);
    expect(role.isSystem).toBe(true);
    expect(role.schoolId).toBeNull();
    expect(
      role.rolePermissions.map((entry) => entry.permission.code).sort(),
    ).toEqual([...PERMISSION_CODES].sort());

    expect(auditEntries.length).toBeGreaterThan(0);
    const safeEvidence = JSON.stringify({ result, auditEntries });
    expect(safeEvidence).not.toContain(password);
    expect(safeEvidence).not.toContain(user.passwordHash!);
  });

  it.each([
    ['invalid email', { email: 'not-an-email' }],
    ['blank first name', { firstName: '   ' }],
    ['blank last name', { lastName: '   ' }],
  ])('rejects %s without creating a user', async (_label, override) => {
    const command = { ...validCommand('invalid-input'), ...override };

    await expectBootstrapFailure(useCase.execute(command), /INVALID/u);

    await expectUserMissing(command.email);
  });

  it('rejects a password-policy violation before persistence', async () => {
    const command = validCommand(
      'weak-password',
      randomBytes(3).toString('hex'),
    );

    await expectBootstrapFailure(useCase.execute(command), /PASSWORD_POLICY/u);

    await expectUserMissing(command.email);
  });

  it('fails closed when a legitimate Platform Administrator already exists', async () => {
    await createDirectUser({
      suffix: 'existing-admin',
      userType: UserType.PLATFORM_USER,
      status: UserStatus.ACTIVE,
    });

    const command = validCommand('blocked-by-existing-admin');
    await expectBootstrapFailure(
      useCase.execute(command),
      /^ALREADY_INITIALIZED$/u,
    );
    await expectUserMissing(command.email);
  });

  it('rejects replay without changing the existing administrator password hash', async () => {
    const firstPassword = strongPassword();
    const command = validCommand('replay', firstPassword);
    const created = await useCase.execute(command);
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: created.platformAdminUserId },
      select: { passwordHash: true, credentialVersion: true },
    });

    await expectBootstrapFailure(
      useCase.execute({ ...command, password: strongPassword() }),
      /^ALREADY_INITIALIZED$/u,
    );

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: created.platformAdminUserId },
      select: { passwordHash: true, credentialVersion: true },
    });
    expect(after).toEqual(before);
    await expect(
      passwordService.verify(after.passwordHash!, firstPassword),
    ).resolves.toBe(true);
  });

  it('retains the initialization marker after the created credential is disabled', async () => {
    const command = validCommand('durable-replay-marker');
    const created = await useCase.execute(command);
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: created.platformAdminUserId },
      select: { credentialVersion: true },
    });

    await prisma.user.update({
      where: { id: created.platformAdminUserId },
      data: {
        status: UserStatus.DISABLED,
        passwordHash: null,
      },
    });

    const replay = validCommand('durable-replay-after-disable');
    await expectBootstrapFailure(
      useCase.execute(replay),
      /^ALREADY_INITIALIZED$/u,
    );

    await expectUserMissing(replay.email);
    await expect(
      prisma.user.findUniqueOrThrow({
        where: { id: created.platformAdminUserId },
        select: {
          status: true,
          passwordHash: true,
          credentialVersion: true,
        },
      }),
    ).resolves.toEqual({
      status: UserStatus.DISABLED,
      passwordHash: null,
      credentialVersion: before.credentialVersion,
    });
  });

  it('does not take over an existing non-admin identity case-insensitively', async () => {
    const existing = await createDirectUser({
      suffix: 'existing-non-admin',
      userType: UserType.SCHOOL_USER,
      status: UserStatus.ACTIVE,
    });
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: existing.id },
      select: { passwordHash: true, userType: true, status: true },
    });

    await expectBootstrapFailure(
      useCase.execute(
        validCommand('unused', strongPassword(), {
          email: existing.email.toUpperCase(),
        }),
      ),
      /^EMAIL_IN_USE$/u,
    );

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: existing.id },
      select: { passwordHash: true, userType: true, status: true },
    });
    expect(after).toEqual(before);
  });

  it('allows exactly one of two concurrent first-admin attempts to commit', async () => {
    const attempts = await Promise.allSettled([
      useCase.execute(validCommand('concurrent-a')),
      useCase.execute(validCommand('concurrent-b')),
    ]);

    const fulfilled = attempts.filter(
      (
        attempt,
      ): attempt is PromiseFulfilledResult<
        Awaited<
          ReturnType<BootstrapInitialPlatformAdministratorUseCase['execute']>
        >
      > => attempt.status === 'fulfilled',
    );
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult =>
        attempt.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(fulfilled[0].value.roleCode).toBe(PLATFORM_ADMIN_ROLE_CODE);
    expect(rejected[0].reason).toBeInstanceOf(PlatformAdminBootstrapError);
    expect((rejected[0].reason as PlatformAdminBootstrapError).reason).toBe(
      'ALREADY_INITIALIZED',
    );

    await expect(
      prisma.user.count({
        where: {
          email: { startsWith: TEST_MARKER },
          userType: UserType.PLATFORM_USER,
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
      }),
    ).resolves.toBe(1);
  });

  it('rolls back the user when bootstrap audit persistence fails', async () => {
    const injectedFailure = new Error('injected bootstrap audit failure');
    const failingPrisma = prisma.$extends({
      query: {
        auditLog: {
          create() {
            throw injectedFailure;
          },
        },
      },
    });
    const failingRepository = new PlatformAdminBootstrapRepository(
      failingPrisma as unknown as PrismaService,
    );
    const failingUseCase = new BootstrapInitialPlatformAdministratorUseCase(
      failingRepository,
      passwordService,
    );
    const command = validCommand('audit-rollback');
    const auditCountBefore = await prisma.auditLog.count();

    await expect(failingUseCase.execute(command)).rejects.toBe(injectedFailure);
    await expectUserMissing(command.email);
    await expect(prisma.auditLog.count()).resolves.toBe(auditCountBefore);
  });

  it('creates an account accepted by the real normal password-login flow', async () => {
    const password = strongPassword();
    const command = validCommand('real-login', password);
    const created = await useCase.execute(command);
    const authRepository = new AuthRepository(
      prisma as unknown as PrismaService,
    );
    const tokenService = new TokenService(
      new JwtService(),
      tokenConfigService(),
    );
    const loginUseCase = new LoginUseCase(
      authRepository,
      passwordService,
      tokenService,
    );

    const login = await loginUseCase.execute({
      email: `  ${command.email.toUpperCase()}  `,
      password,
      ipAddress: '127.0.0.1',
      userAgent: 'stage20b-integration',
    });

    expect(login.user).toMatchObject({
      id: created.platformAdminUserId,
      email: command.email,
      userType: UserType.PLATFORM_USER,
      mustChangePassword: false,
    });
    expect(login.accessToken).toEqual(expect.any(String));
    expect(login.refreshToken).toEqual(expect.any(String));
    await expect(
      authRepository.findSystemRolePermissionCodes(PLATFORM_ADMIN_ROLE_CODE),
    ).resolves.toEqual(expect.arrayContaining(PERMISSION_CODES));
  });

  function validCommand(
    suffix: string,
    password = strongPassword(),
    override: Partial<{
      email: string;
      password: string;
      firstName: string;
      lastName: string;
    }> = {},
  ) {
    return {
      email: `${TEST_MARKER}-${suffix}@example.test`,
      password,
      firstName: 'Initial',
      lastName: 'Administrator',
      ...override,
    };
  }

  async function createDirectUser(input: {
    suffix: string;
    userType: UserType;
    status: UserStatus;
  }): Promise<{ id: string; email: string }> {
    const email = `${TEST_MARKER}-${input.suffix}@example.test`;
    const passwordHash = await passwordService.hash(strongPassword());
    return prisma.user.create({
      data: {
        email,
        firstName: 'Existing',
        lastName: 'Fixture',
        userType: input.userType,
        status: input.status,
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        passwordProvisionedAt: new Date(),
        credentialVersion: 1,
      },
      select: { id: true, email: true },
    });
  }

  async function loadCanonicalRole() {
    return prisma.role.findFirstOrThrow({
      where: {
        key: PLATFORM_ADMIN_ROLE_CODE,
        schoolId: null,
        isSystem: true,
        deletedAt: null,
      },
      select: {
        key: true,
        schoolId: true,
        isSystem: true,
        rolePermissions: {
          select: { permission: { select: { code: true } } },
        },
      },
    });
  }

  function loadBootstrapAuditEntries(userId: string): Promise<AuditLog[]> {
    return prisma.auditLog.findMany({
      where: {
        resourceType: 'user',
        resourceId: userId,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async function expectBootstrapFailure(
    operation: Promise<unknown>,
    expectedReason: RegExp,
  ): Promise<void> {
    try {
      await operation;
      throw new Error('Expected Platform Administrator bootstrap to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(PlatformAdminBootstrapError);
      expect((error as PlatformAdminBootstrapError).reason).toMatch(
        expectedReason,
      );
    }
  }

  async function expectUserMissing(email: string): Promise<void> {
    await expect(
      prisma.user.findUnique({ where: { email } }),
    ).resolves.toBeNull();
  }

  async function cleanTestUsers(): Promise<void> {
    const users = await prisma.user.findMany({
      where: {
        email: { contains: TEST_MARKER, mode: 'insensitive' },
      },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);

    const candidateAuditEntries = await prisma.auditLog.findMany({
      select: {
        id: true,
        actorId: true,
        resourceId: true,
        before: true,
        after: true,
      },
    });
    const userIdSet = new Set(userIds);
    const auditIds = candidateAuditEntries
      .filter(
        (entry) =>
          (entry.actorId !== null && userIdSet.has(entry.actorId)) ||
          (entry.resourceId !== null && userIdSet.has(entry.resourceId)) ||
          JSON.stringify(entry.before).includes(TEST_MARKER) ||
          JSON.stringify(entry.after).includes(TEST_MARKER),
      )
      .map((entry) => entry.id);

    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { id: { in: auditIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

function strongPassword(): string {
  return `Aa1!${randomBytes(18).toString('base64url')}`;
}

function assertDisposableIntegrationDatabase(
  environment: NodeJS.ProcessEnv,
): void {
  if (environment.NODE_ENV !== 'test' || !environment.DATABASE_URL) {
    throw new Error(DISPOSABLE_DATABASE_REQUIRED_MESSAGE);
  }

  let databaseUrl: URL;
  let databaseName: string;
  try {
    databaseUrl = new URL(environment.DATABASE_URL);
    databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
  } catch {
    throw new Error(DISPOSABLE_DATABASE_REQUIRED_MESSAGE);
  }

  const isLoopback =
    databaseUrl.hostname === 'localhost' ||
    databaseUrl.hostname === '127.0.0.1';
  const isDisposableDatabase =
    LOCAL_DISPOSABLE_DATABASE_PATTERN.test(databaseName) ||
    CI_DISPOSABLE_DATABASE_PATTERN.test(databaseName);

  if (
    databaseUrl.protocol !== 'postgresql:' ||
    !isLoopback ||
    !isDisposableDatabase
  ) {
    throw new Error(DISPOSABLE_DATABASE_REQUIRED_MESSAGE);
  }
}

function tokenConfigService(): ConfigService<Env, true> {
  return new ConfigService<Env, true>({
    JWT_ACCESS_SECRET: randomBytes(32).toString('base64url'),
    JWT_REFRESH_SECRET: randomBytes(32).toString('base64url'),
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
  } as unknown as Env);
}
