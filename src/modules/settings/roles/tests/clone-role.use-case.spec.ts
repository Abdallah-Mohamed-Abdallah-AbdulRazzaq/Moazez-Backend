import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { CloneRoleUseCase } from '../application/clone-role.use-case';
import { RolesRepository } from '../infrastructure/roles.repository';

describe('CloneRoleUseCase', () => {
  it('copies permissions from the source role', async () => {
    const rolesRepository = {
      findVisibleRoleById: jest.fn().mockResolvedValue({
        id: 'role-source',
        name: 'School Admin',
        description: 'System admin',
        isSystem: true,
        rolePermissions: [
          { permissionId: 'perm-1', permission: { code: 'settings.users.view' } },
          { permissionId: 'perm-2', permission: { code: 'settings.roles.manage' } },
        ],
        _count: { memberships: 2 },
      }),
      findVisibleRoleByKey: jest.fn().mockResolvedValue(null),
      cloneRole: jest.fn().mockResolvedValue({
        id: 'role-clone',
        name: 'School Admin Copy',
        description: 'System admin',
        isSystem: false,
        rolePermissions: [
          { permissionId: 'perm-1', permission: { code: 'settings.users.view' } },
          { permissionId: 'perm-2', permission: { code: 'settings.roles.manage' } },
        ],
        _count: { memberships: 0 },
      }),
    } as unknown as RolesRepository;
    const authRepository = {
      createAuditLog: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthRepository;

    const useCase = new CloneRoleUseCase(rolesRepository, authRepository);

    await runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['settings.roles.manage'],
      });

      const result = await useCase.execute('role-source', {
        name: 'School Admin Copy',
      });

      expect(rolesRepository.cloneRole).toHaveBeenCalledWith(
        expect.objectContaining({
          schoolId: 'school-1',
          permissionIds: ['perm-1', 'perm-2'],
        }),
      );
      expect(result.permissions).toEqual([
        'settings.roles.manage',
        'settings.users.view',
      ]);
    });
  });
});
