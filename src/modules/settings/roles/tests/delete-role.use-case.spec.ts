import { AuditOutcome, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { DeleteRoleUseCase } from '../application/delete-role.use-case';
import {
  RoleInUseException,
  SystemRoleCannotDeleteException,
} from '../domain/role.exceptions';
import { RolesRepository } from '../infrastructure/roles.repository';

describe('DeleteRoleUseCase', () => {
  async function withScope(testFn: () => Promise<void>): Promise<void> {
    await runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['settings.roles.manage'],
      });

      await testFn();
    });
  }

  it('rejects deleting system roles', async () => {
    const createAuditLog = jest.fn();
    const rolesRepository = {
      findVisibleRoleById: jest.fn().mockResolvedValue({
        id: 'role-system',
        isSystem: true,
        _count: { memberships: 0 },
      }),
    } as unknown as RolesRepository;
    const authRepository = {
      createAuditLog,
    } as unknown as AuthRepository;

    const useCase = new DeleteRoleUseCase(rolesRepository, authRepository);

    await withScope(async () => {
      await expect(useCase.execute('role-system')).rejects.toBeInstanceOf(
        SystemRoleCannotDeleteException,
      );
      expect(createAuditLog).not.toHaveBeenCalled();
    });
  });

  it('rejects deleting roles that still have assigned members', async () => {
    const createAuditLog = jest.fn();
    const rolesRepository = {
      findVisibleRoleById: jest.fn().mockResolvedValue({
        id: 'role-custom',
        isSystem: false,
        _count: { memberships: 3 },
      }),
    } as unknown as RolesRepository;
    const authRepository = {
      createAuditLog,
    } as unknown as AuthRepository;

    const useCase = new DeleteRoleUseCase(rolesRepository, authRepository);

    await withScope(async () => {
      await expect(useCase.execute('role-custom')).rejects.toBeInstanceOf(
        RoleInUseException,
      );
      expect(createAuditLog).not.toHaveBeenCalled();
    });
  });

  it('writes an audit record for successful role deletion', async () => {
    const softDeleteRole = jest.fn().mockResolvedValue(undefined);
    const createAuditLog = jest.fn().mockResolvedValue(undefined);
    const rolesRepository = {
      findVisibleRoleById: jest.fn().mockResolvedValue({
        id: 'role-custom',
        key: 'custom_role',
        name: 'Custom Role',
        description: 'Custom access',
        isSystem: false,
        rolePermissions: [
          { permissionId: 'perm-1', permission: { code: 'settings.users.manage' } },
          { permissionId: 'perm-2', permission: { code: 'settings.roles.manage' } },
        ],
        _count: { memberships: 0 },
      }),
      softDeleteRole,
    } as unknown as RolesRepository;
    const authRepository = {
      createAuditLog,
    } as unknown as AuthRepository;

    const useCase = new DeleteRoleUseCase(rolesRepository, authRepository);

    await withScope(async () => {
      await expect(useCase.execute('role-custom')).resolves.toEqual({ ok: true });

      expect(softDeleteRole).toHaveBeenCalledWith('role-custom');
      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'user-1',
          schoolId: 'school-1',
          module: 'iam',
          action: 'iam.role.delete',
          resourceType: 'role',
          resourceId: 'role-custom',
          outcome: AuditOutcome.SUCCESS,
        }),
      );
    });
  });
});
