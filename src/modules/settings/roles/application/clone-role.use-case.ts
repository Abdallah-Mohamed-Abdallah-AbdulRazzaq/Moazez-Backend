import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../settings-context';
import { normalizeRoleKey } from '../domain/normalize-role-key';
import { RoleNameTakenException } from '../domain/role.exceptions';
import { CloneRoleDto } from '../dto/clone-role.dto';
import { RoleResponseDto } from '../dto/role-response.dto';
import { RolesRepository } from '../infrastructure/roles.repository';
import { presentRole } from '../presenters/roles.presenter';

@Injectable()
export class CloneRoleUseCase {
  constructor(
    private readonly rolesRepository: RolesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(roleId: string, command: CloneRoleDto): Promise<RoleResponseDto> {
    const scope = requireSettingsScope();
    const source = await this.rolesRepository.findVisibleRoleById(
      scope.schoolId,
      roleId,
    );
    if (!source) {
      throw new NotFoundDomainException('Role not found', { roleId });
    }

    const key = normalizeRoleKey(command.name);
    const existing = await this.rolesRepository.findVisibleRoleByKey(
      scope.schoolId,
      key,
    );
    if (existing) {
      throw new RoleNameTakenException(command.name);
    }

    const cloned = await this.rolesRepository.cloneRole({
      schoolId: scope.schoolId,
      key,
      name: command.name.trim(),
      description: source.description,
      permissionIds: source.rolePermissions.map(
        (rolePermission) => rolePermission.permissionId,
      ),
    });

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'iam',
      action: 'role.clone',
      resourceType: 'role',
      resourceId: cloned.id,
      outcome: AuditOutcome.SUCCESS,
      after: { sourceRoleId: source.id, clonedRoleId: cloned.id },
    });

    return presentRole(cloned);
  }
}
