import { AuditOutcome, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../../common/context/request-context';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { CreateRoleUseCase } from '../application/create-role.use-case';
import { RolesRepository } from '../infrastructure/roles.repository';

describe('CreateRoleUseCase', () => {
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

  it('writes an audit record for successful role creation', async () => {
    const findVisibleRoleByKey = jest.fn().mockResolvedValue(null);
    const createCustomRole = jest.fn().mockResolvedValue({
      id: 'role-custom',
      key: 'admissions_coordinator',
      name: 'Admissions Coordinator',
      description: 'Handles admissions workflows',
      isSystem: false,
      rolePermissions: [],
      _count: { memberships: 0 },
    });
    const rolesRepository = {
      findVisibleRoleByKey,
      createCustomRole,
    } as unknown as RolesRepository;
    const createAuditLog = jest.fn().mockResolvedValue(undefined);
    const authRepository = {
      createAuditLog,
    } as unknown as AuthRepository;

    const useCase = new CreateRoleUseCase(rolesRepository, authRepository);

    await withScope(async () => {
      const result = await useCase.execute({
        name: 'Admissions Coordinator',
        description: 'Handles admissions workflows',
      });

      expect(createCustomRole).toHaveBeenCalledWith({
        schoolId: 'school-1',
        key: 'admissions_coordinator',
        name: 'Admissions Coordinator',
        description: 'Handles admissions workflows',
      });
      expect(createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'user-1',
          schoolId: 'school-1',
          module: 'iam',
          action: 'iam.role.create',
          resourceType: 'role',
          resourceId: 'role-custom',
          outcome: AuditOutcome.SUCCESS,
        }),
      );
      expect(result.permissions).toEqual([]);
    });
  });
});
