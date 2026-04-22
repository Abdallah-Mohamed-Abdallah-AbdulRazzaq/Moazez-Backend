import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../settings-context';
import {
  SystemRoleCannotModifyException,
  UnknownPermissionException,
} from '../domain/role.exceptions';
import { RolePermissionsResponseDto } from '../dto/role-response.dto';
import { UpdateRolePermissionsDto } from '../dto/update-role-permissions.dto';
import { RolesRepository } from '../infrastructure/roles.repository';
import { presentRolePermissions } from '../presenters/roles.presenter';

@Injectable()
export class ReplaceRolePermissionsUseCase {
  constructor(
    private readonly rolesRepository: RolesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    roleId: string,
    command: UpdateRolePermissionsDto,
  ): Promise<RolePermissionsResponseDto> {
    const scope = requireSettingsScope();
    const role = await this.rolesRepository.findVisibleRoleById(
      scope.schoolId,
      roleId,
    );
    if (!role) {
      throw new NotFoundDomainException('Role not found', { roleId });
    }
    if (role.isSystem) {
      throw new SystemRoleCannotModifyException(roleId);
    }

    const uniqueCodes = [...new Set(command.permissions)];
    const permissions = await this.rolesRepository.listPermissionsByCodes(
      uniqueCodes,
    );

    if (permissions.length !== uniqueCodes.length) {
      const foundCodes = new Set(permissions.map((permission) => permission.code));
      const missingCodes = uniqueCodes.filter((code) => !foundCodes.has(code));
      throw new UnknownPermissionException(missingCodes);
    }

    await this.rolesRepository.replaceRolePermissions(
      role.id,
      permissions.map((permission) => permission.id),
    );

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'iam',
      action: 'iam.role.permissions.change',
      resourceType: 'role',
      resourceId: role.id,
      outcome: AuditOutcome.SUCCESS,
      before: {
        permissions: role.rolePermissions
          .map((rolePermission) => rolePermission.permission.code)
          .sort(),
      },
      after: {
        permissions: permissions.map((permission) => permission.code).sort(),
      },
    });

    return presentRolePermissions(role.id, uniqueCodes);
  }
}
