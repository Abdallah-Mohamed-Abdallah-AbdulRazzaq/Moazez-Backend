import { AuditOutcome, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { ReplaceRolePermissionsUseCase } from '../application/replace-role-permissions.use-case';
import { RolesRepository } from '../infrastructure/roles.repository';

describe('ReplaceRolePermissionsUseCase', () => {
  it('writes an audit record when replacing role permissions', async () => {
    const replaceRolePermissions = jest.fn().mockResolvedValue(undefined);
    const rolesRepository = {
      findVisibleRoleById: jest.fn().mockResolvedValue({
        id: 'role-custom',
        key: 'custom_role',
        name: 'Custom Role',
        description: 'Custom access',
        isSystem: false,
        rolePermissions: [
          { permissionId: 'perm-1', permission: { code: 'settings.users.view' } },
          { permissionId: 'perm-2', permission: { code: 'settings.roles.manage' } },
        ],
        _count: { memberships: 0 },
      }),
      listPermissionsByCodes: jest.fn().mockResolvedValue([
        { id: 'perm-3', code: 'settings.branding.manage' },
        { id: 'perm-4', code: 'settings.users.manage' },
      ]),
      replaceRolePermissions,
    } as unknown as RolesRepository;
    const createAuditLog = jest.fn().mockResolvedValue(undefined);
    const authRepository = {
      createAuditLog,
    } as unknown as AuthRepository;

    const useCase = new ReplaceRolePermissionsUseCase(
      rolesRepository,
      authRepository,
    );

    await runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: 'membership-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
        permissions: ['settings.roles.manage'],
      });

      const result = await useCase.execute('role-custom', {
        permissions: [
          'settings.users.manage',
          'settings.branding.manage',
          'settings.users.manage',
        ],
      });

      expect(replaceRolePermissions).toHaveBeenCalledWith('role-custom', [
        'perm-3',
        'perm-4',
      ]);

      const auditEntry = createAuditLog.mock.calls[0][0];
      expect(auditEntry).toEqual(
        expect.objectContaining({
          actorId: 'user-1',
          schoolId: 'school-1',
          module: 'iam',
          action: 'iam.role.permissions.change',
          resourceType: 'role',
          resourceId: 'role-custom',
          outcome: AuditOutcome.SUCCESS,
        }),
      );
      expect(auditEntry.before).toEqual({
        permissions: ['settings.roles.manage', 'settings.users.view'],
      });
      expect(auditEntry.after).toEqual({
        permissions: ['settings.branding.manage', 'settings.users.manage'],
      });
      expect(result.permissions).toEqual([
        'settings.branding.manage',
        'settings.users.manage',
      ]);
    });
  });
});
