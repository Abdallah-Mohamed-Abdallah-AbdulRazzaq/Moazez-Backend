import {
  AuditOutcome,
  MembershipStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../../common/context/request-context';
import { AuthRepository } from '../../../../iam/auth/infrastructure/auth.repository';
import { BulkCredentialGenerateUseCase } from '../application/bulk-credential-generate.use-case';
import { BulkCredentialPreviewUseCase } from '../application/bulk-credential-preview.use-case';
import { GenerateUserCredentialUseCase } from '../application/generate-user-credential.use-case';
import { ListCredentialStatusUseCase } from '../application/list-credential-status.use-case';
import { SetUserCredentialUseCase } from '../application/set-user-credential.use-case';
import { PasswordService } from '../../../../iam/auth/domain/password.service';
import {
  CredentialBulkTooLargeException,
  CredentialNoEligibleUsersException,
  CredentialPasswordPolicyFailedException,
} from '../domain/credential.exceptions';
import {
  CredentialMembershipRecord,
  UserCredentialsRepository,
} from '../infrastructure/user-credentials.repository';

describe('user credential use cases', () => {
  async function withSettingsScope<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'actor-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-actor',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-admin',
        permissions: ['settings.users.view', 'settings.users.manage'],
      });

      return fn();
    });
  }

  function membership(
    overrides?: Partial<{
      id: string;
      userId: string;
      email: string;
      username: string | null;
      passwordHash: string | null;
      mustChangePassword: boolean;
      passwordChangedAt: Date | null;
      passwordProvisionedAt: Date | null;
      credentialVersion: number;
      status: UserStatus;
      userType: UserType;
      roleKey: string;
    }>,
  ): CredentialMembershipRecord {
    const now = new Date('2026-05-11T10:00:00.000Z');

    return {
      id: overrides?.id ?? 'membership-1',
      userId: overrides?.userId ?? 'user-1',
      organizationId: 'org-1',
      schoolId: 'school-1',
      roleId: 'role-1',
      userType: overrides?.userType ?? UserType.SCHOOL_USER,
      status: MembershipStatus.ACTIVE,
      startedAt: now,
      endedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      role: {
        id: 'role-1',
        key: overrides?.roleKey ?? 'teacher',
        name: 'Teacher',
      },
      user: {
        id: overrides?.userId ?? 'user-1',
        email: overrides?.email ?? 'teacher@example.com',
        username: overrides?.username ?? 'teacher.one',
        contactEmail: 'contact@example.com',
        passwordHash: overrides?.passwordHash ?? null,
        firstName: 'Teacher',
        lastName: 'One',
        userType: overrides?.userType ?? UserType.SCHOOL_USER,
        status: overrides?.status ?? UserStatus.ACTIVE,
        lastLoginAt: null,
        mustChangePassword: overrides?.mustChangePassword ?? false,
        passwordChangedAt: overrides?.passwordChangedAt ?? null,
        passwordProvisionedAt: overrides?.passwordProvisionedAt ?? null,
        credentialVersion: overrides?.credentialVersion ?? 0,
        createdAt: now,
        deletedAt: null,
      },
    } as CredentialMembershipRecord;
  }

  function buildUpdatedMembership(
    source: CredentialMembershipRecord,
    data: {
      passwordHash: string;
      mustChangePassword: boolean;
      passwordProvisionedAt: Date;
      passwordChangedAt?: Date | null;
    },
  ): CredentialMembershipRecord {
    return {
      ...source,
      user: {
        ...source.user,
        passwordHash: data.passwordHash,
        mustChangePassword: data.mustChangePassword,
        passwordProvisionedAt: data.passwordProvisionedAt,
        passwordChangedAt: data.passwordChangedAt ?? null,
        credentialVersion: source.user.credentialVersion + 1,
      },
    } as CredentialMembershipRecord;
  }

  function repositories(targets: CredentialMembershipRecord[]) {
    const byUserId = new Map(targets.map((item) => [item.user.id, item]));
    const credentialsRepository = {
      findScopedMembershipByUserId: jest.fn((userId: string) =>
        Promise.resolve(byUserId.get(userId) ?? null),
      ),
      listCredentialStatus: jest.fn().mockResolvedValue({
        items: targets,
        total: targets.length,
      }),
      listCredentialTargets: jest.fn().mockResolvedValue(targets),
      updateUserCredential: jest.fn((data) => {
        const source = byUserId.get(data.userId);
        if (!source) throw new Error('missing test target');
        const updated = buildUpdatedMembership(source, data);
        byUserId.set(data.userId, updated);
        return Promise.resolve(updated);
      }),
    } as unknown as UserCredentialsRepository;

    const authRepository = {
      revokeUserSessions: jest.fn().mockResolvedValue({ count: 0 }),
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;

    const passwordService = {
      hash: jest.fn((plain: string) => Promise.resolve(`hashed:${plain}`)),
    } as unknown as PasswordService;

    return { credentialsRepository, authRepository, passwordService };
  }

  it('generates a one-time temporary password and audits without raw credentials', async () => {
    const target = membership();
    const { credentialsRepository, authRepository, passwordService } =
      repositories([target]);
    const useCase = new GenerateUserCredentialUseCase(
      credentialsRepository,
      authRepository,
      passwordService,
    );

    const result = await withSettingsScope(() =>
      useCase.execute('user-1', 'generate'),
    );

    expect(result.temporaryPassword).toMatch(/^MZ-/);
    expect(result.mustChangePassword).toBe(true);
    expect(result.user.status).toBe('temporary_or_must_change');
    expect(credentialsRepository.updateUserCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        passwordHash: `hashed:${result.temporaryPassword}`,
        mustChangePassword: true,
        passwordChangedAt: null,
      }),
    );
    expect(authRepository.revokeUserSessions).toHaveBeenCalledWith('user-1');

    const auditEntry = (authRepository.createAuditLog as jest.Mock).mock
      .calls[0][0];
    expect(auditEntry).toEqual(
      expect.objectContaining({
        action: 'iam.credentials.generate',
        outcome: AuditOutcome.SUCCESS,
      }),
    );
    expect(JSON.stringify(auditEntry)).not.toContain(result.temporaryPassword);
  });

  it('sets an admin-provided password without returning it', async () => {
    const target = membership({ passwordHash: 'old-hash' });
    const { credentialsRepository, authRepository, passwordService } =
      repositories([target]);
    const useCase = new SetUserCredentialUseCase(
      credentialsRepository,
      authRepository,
      passwordService,
    );

    const result = await withSettingsScope(() =>
      useCase.execute('user-1', {
        password: 'StrongPass123!',
        forceResetOnLogin: false,
      }),
    );

    expect(result).not.toHaveProperty('temporaryPassword');
    expect(result.mustChangePassword).toBe(false);
    expect(result.user.status).toBe('set');
    expect(credentialsRepository.updateUserCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        passwordHash: 'hashed:StrongPass123!',
        mustChangePassword: false,
        passwordChangedAt: expect.any(Date),
      }),
    );
    expect(
      JSON.stringify((authRepository.createAuditLog as jest.Mock).mock.calls),
    ).not.toContain('StrongPass123!');
  });

  it('rejects admin-provided passwords that fail policy', async () => {
    const { credentialsRepository, authRepository, passwordService } =
      repositories([membership()]);
    const useCase = new SetUserCredentialUseCase(
      credentialsRepository,
      authRepository,
      passwordService,
    );

    await expect(
      withSettingsScope(() =>
        useCase.execute('user-1', {
          password: 'password',
        }),
      ),
    ).rejects.toBeInstanceOf(CredentialPasswordPolicyFailedException);

    expect(passwordService.hash).not.toHaveBeenCalled();
    expect(authRepository.createAuditLog).not.toHaveBeenCalled();
  });

  it('regenerates an existing password and forces change on next login', async () => {
    const target = membership({
      passwordHash: 'old-hash',
      passwordChangedAt: new Date('2026-05-10T10:00:00.000Z'),
      credentialVersion: 2,
    });
    const { credentialsRepository, authRepository, passwordService } =
      repositories([target]);
    const useCase = new GenerateUserCredentialUseCase(
      credentialsRepository,
      authRepository,
      passwordService,
    );

    const result = await withSettingsScope(() =>
      useCase.execute('user-1', 'regenerate'),
    );

    expect(result.credentialVersion).toBe(3);
    expect(result.user.mustChangePassword).toBe(true);
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'iam.credentials.regenerate',
      }),
    );
  });

  it('lists credential status without exposing hashes or tenant ids', async () => {
    const { credentialsRepository } = repositories([
      membership({
        passwordHash: 'hash',
        mustChangePassword: true,
        passwordProvisionedAt: new Date('2026-05-11T10:00:00.000Z'),
      }),
    ]);
    const useCase = new ListCredentialStatusUseCase(credentialsRepository);

    const result = await withSettingsScope(() =>
      useCase.execute({ page: 1, limit: 20 }),
    );

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        status: 'temporary_or_must_change',
        hasPassword: true,
      }),
    );
    expect(result.items[0]).not.toHaveProperty('passwordHash');
    expect(result.items[0]).not.toHaveProperty('schoolId');
    expect(result.items[0]).not.toHaveProperty('organizationId');
  });

  it('previews and bulk-generates only eligible current-school targets', async () => {
    const eligible = membership({ userId: 'user-1' });
    const skipped = membership({
      id: 'membership-2',
      userId: 'user-2',
      passwordHash: 'existing-hash',
    });
    const { credentialsRepository, authRepository, passwordService } =
      repositories([eligible, skipped]);
    const previewUseCase = new BulkCredentialPreviewUseCase(
      credentialsRepository,
    );
    const generateUseCase = new BulkCredentialGenerateUseCase(
      credentialsRepository,
      authRepository,
      passwordService,
    );

    const preview = await withSettingsScope(() =>
      previewUseCase.execute({ scope: 'all_school_users' }),
    );

    expect(preview.totalMatched).toBe(2);
    expect(preview.eligible).toBe(1);
    expect(preview.skippedReasons).toEqual({ already_has_password: 1 });

    const generated = await withSettingsScope(() =>
      generateUseCase.execute({ scope: 'all_school_users' }),
    );

    expect(generated.generated).toBe(1);
    expect(generated.items).toHaveLength(1);
    expect(generated.items[0].temporaryPassword).toMatch(/^MZ-/);
    expect(credentialsRepository.updateUserCredential).toHaveBeenCalledTimes(1);
    expect(
      JSON.stringify((authRepository.createAuditLog as jest.Mock).mock.calls),
    ).not.toContain(generated.items[0].temporaryPassword);
  });

  it('rejects empty and oversized bulk generation selections', async () => {
    const empty = repositories([]);
    const emptyUseCase = new BulkCredentialGenerateUseCase(
      empty.credentialsRepository,
      empty.authRepository,
      empty.passwordService,
    );

    await expect(
      withSettingsScope(() =>
        emptyUseCase.execute({ scope: 'all_school_users' }),
      ),
    ).rejects.toBeInstanceOf(CredentialNoEligibleUsersException);

    const manyTargets = Array.from({ length: 101 }, (_, index) =>
      membership({ id: `membership-${index}`, userId: `user-${index}` }),
    );
    const many = repositories(manyTargets);
    const manyUseCase = new BulkCredentialGenerateUseCase(
      many.credentialsRepository,
      many.authRepository,
      many.passwordService,
    );

    await expect(
      withSettingsScope(() =>
        manyUseCase.execute({ scope: 'all_school_users' }),
      ),
    ).rejects.toBeInstanceOf(CredentialBulkTooLargeException);
  });
});
