import {
  AuditOutcome,
  MembershipStatus,
  UserStatus,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActor,
} from '../../../../common/context/request-context';
import { ChangePasswordUseCase } from '../application/change-password.use-case';
import { PasswordService } from '../domain/password.service';
import { AuthRepository } from '../infrastructure/auth.repository';
import {
  CredentialCurrentPasswordInvalidException,
  CredentialPasswordPolicyFailedException,
} from '../../../settings/users/credentials/domain/credential.exceptions';

describe('ChangePasswordUseCase', () => {
  async function withActor<T>(fn: () => Promise<T>): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      return fn();
    });
  }

  function user(passwordHash = 'old-hash') {
    return {
      id: 'user-1',
      email: 'user@example.com',
      username: 'user.one',
      contactEmail: null,
      phone: null,
      passwordHash,
      firstName: 'User',
      lastName: 'One',
      userType: UserType.SCHOOL_USER,
      status: UserStatus.ACTIVE,
      lastLoginAt: null,
      mustChangePassword: true,
      passwordChangedAt: null,
      passwordProvisionedAt: new Date('2026-05-11T10:00:00.000Z'),
      credentialVersion: 1,
      createdAt: new Date('2026-05-10T10:00:00.000Z'),
      updatedAt: new Date('2026-05-10T10:00:00.000Z'),
      deletedAt: null,
      memberships: [
        {
          id: 'membership-1',
          userId: 'user-1',
          organizationId: 'org-1',
          schoolId: 'school-1',
          roleId: 'role-1',
          userType: UserType.SCHOOL_USER,
          status: MembershipStatus.ACTIVE,
          startedAt: new Date('2026-05-10T10:00:00.000Z'),
          endedAt: null,
          createdAt: new Date('2026-05-10T10:00:00.000Z'),
          updatedAt: new Date('2026-05-10T10:00:00.000Z'),
          deletedAt: null,
          role: {
            id: 'role-1',
            key: 'school_admin',
            name: 'School Admin',
            description: null,
            schoolId: null,
            isSystem: true,
            createdAt: new Date('2026-05-10T10:00:00.000Z'),
            updatedAt: new Date('2026-05-10T10:00:00.000Z'),
            deletedAt: null,
            rolePermissions: [],
          },
        },
      ],
    };
  }

  function dependencies(options?: { verify?: boolean }) {
    const authRepository = {
      findUserById: jest.fn().mockResolvedValue(user()),
      updatePasswordCredential: jest.fn().mockResolvedValue(undefined),
      revokeUserSessions: jest.fn().mockResolvedValue({ count: 1 }),
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;
    const passwordService = {
      verify: jest.fn().mockResolvedValue(options?.verify ?? true),
      hash: jest.fn().mockResolvedValue('new-hash'),
    } as unknown as PasswordService;

    return { authRepository, passwordService };
  }

  it('requires the current password and clears mustChangePassword', async () => {
    const { authRepository, passwordService } = dependencies();
    const useCase = new ChangePasswordUseCase(authRepository, passwordService);

    const result = await withActor(() =>
      useCase.execute(
        {
          currentPassword: 'OldPass123!',
          newPassword: 'NewStrongPass123!',
        },
        'session-current',
      ),
    );

    expect(result).toEqual({ success: true, mustChangePassword: false });
    expect(passwordService.verify).toHaveBeenCalledWith(
      'old-hash',
      'OldPass123!',
    );
    expect(authRepository.updatePasswordCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        passwordHash: 'new-hash',
        mustChangePassword: false,
        passwordChangedAt: expect.any(Date),
      }),
    );
    expect(authRepository.revokeUserSessions).toHaveBeenCalledWith('user-1', {
      exceptSessionId: 'session-current',
    });
    expect(authRepository.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.password.change',
        outcome: AuditOutcome.SUCCESS,
        after: { mustChangePassword: false },
      }),
    );
    expect(
      JSON.stringify((authRepository.createAuditLog as jest.Mock).mock.calls),
    ).not.toContain('NewStrongPass123!');
  });

  it('rejects an invalid current password', async () => {
    const { authRepository, passwordService } = dependencies({ verify: false });
    const useCase = new ChangePasswordUseCase(authRepository, passwordService);

    await expect(
      withActor(() =>
        useCase.execute({
          currentPassword: 'WrongPass123!',
          newPassword: 'NewStrongPass123!',
        }),
      ),
    ).rejects.toBeInstanceOf(CredentialCurrentPasswordInvalidException);

    expect(authRepository.updatePasswordCredential).not.toHaveBeenCalled();
  });

  it('rejects new passwords that fail credential policy', async () => {
    const { authRepository, passwordService } = dependencies();
    const useCase = new ChangePasswordUseCase(authRepository, passwordService);

    await expect(
      withActor(() =>
        useCase.execute({
          currentPassword: 'OldPass123!',
          newPassword: 'weak',
        }),
      ),
    ).rejects.toBeInstanceOf(CredentialPasswordPolicyFailedException);

    expect(passwordService.hash).not.toHaveBeenCalled();
    expect(authRepository.updatePasswordCredential).not.toHaveBeenCalled();
  });
});
