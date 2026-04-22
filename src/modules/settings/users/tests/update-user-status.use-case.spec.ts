import { AuditOutcome, UserStatus, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { UpdateUserStatusUseCase } from '../application/update-user-status.use-case';
import { UsersRepository } from '../infrastructure/users.repository';

describe('UpdateUserStatusUseCase', () => {
  it('writes an audit record for user status changes', async () => {
    const findScopedMembershipByUserId = jest.fn().mockResolvedValue({
      id: 'membership-2',
      roleId: 'role-2',
      role: { id: 'role-2', name: 'Teacher' },
      user: {
        id: 'user-2',
        status: UserStatus.ACTIVE,
      },
    });
    const updateUserAndMembership = jest.fn().mockResolvedValue({
      id: 'membership-2',
      roleId: 'role-2',
      role: { id: 'role-2', name: 'Teacher' },
      user: {
        id: 'user-2',
        status: UserStatus.DISABLED,
      },
    });
    const usersRepository = {
      findScopedMembershipByUserId,
      updateUserAndMembership,
    } as unknown as UsersRepository;
    const createAuditLog = jest.fn().mockResolvedValue(undefined);
    const authRepository = {
      createAuditLog,
    } as unknown as AuthRepository;

    const useCase = new UpdateUserStatusUseCase(usersRepository, authRepository);

    await runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['settings.users.manage'],
      });

      const result = await useCase.execute('user-2', { status: 'inactive' });

      expect(findScopedMembershipByUserId).toHaveBeenCalledWith('user-2');
      expect(updateUserAndMembership).toHaveBeenCalledWith({
        userId: 'user-2',
        membershipId: 'membership-2',
        status: UserStatus.DISABLED,
      });

      const auditEntry = createAuditLog.mock.calls[0][0];
      expect(auditEntry).toEqual(
        expect.objectContaining({
          actorId: 'user-1',
          schoolId: 'school-1',
          module: 'iam',
          action: 'iam.user.status.change',
          resourceType: 'user',
          resourceId: 'user-2',
          outcome: AuditOutcome.SUCCESS,
        }),
      );
      expect(auditEntry.before).toEqual({ status: UserStatus.ACTIVE });
      expect(auditEntry.after).toEqual({ status: UserStatus.DISABLED });
      expect(result).toEqual({ id: 'user-2', status: 'inactive' });
    });
  });
});
