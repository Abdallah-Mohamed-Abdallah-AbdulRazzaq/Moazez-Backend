import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../settings-context';
import {
  RoleInUseException,
  SystemRoleCannotDeleteException,
} from '../domain/role.exceptions';
import { DeleteRoleResponseDto } from '../dto/role-response.dto';
import { RolesRepository } from '../infrastructure/roles.repository';

@Injectable()
export class DeleteRoleUseCase {
  constructor(
    private readonly rolesRepository: RolesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(roleId: string): Promise<DeleteRoleResponseDto> {
    const scope = requireSettingsScope();
    const role = await this.rolesRepository.findVisibleRoleById(
      scope.schoolId,
      roleId,
    );
    if (!role) {
      throw new NotFoundDomainException('Role not found', { roleId });
    }
    if (role.isSystem) {
      throw new SystemRoleCannotDeleteException(roleId);
    }
    if (role._count.memberships > 0) {
      throw new RoleInUseException(roleId, role._count.memberships);
    }

    await this.rolesRepository.softDeleteRole(role.id);

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'iam',
      action: 'iam.role.delete',
      resourceType: 'role',
      resourceId: role.id,
      outcome: AuditOutcome.SUCCESS,
      before: {
        key: role.key,
        name: role.name,
        description: role.description ?? null,
        permissions: role.rolePermissions
          .map((rolePermission) => rolePermission.permission.code)
          .sort(),
      },
      after: {
        deleted: true,
      },
    });

    return { ok: true };
  }
}
