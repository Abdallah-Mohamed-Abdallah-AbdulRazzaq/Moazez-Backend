import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { requireSettingsScope } from '../../settings-context';
import { normalizeRoleKey } from '../domain/normalize-role-key';
import {
  RoleNameTakenException,
  SystemRoleCannotModifyException,
} from '../domain/role.exceptions';
import { RoleResponseDto } from '../dto/role-response.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import { RolesRepository } from '../infrastructure/roles.repository';
import { presentRole } from '../presenters/roles.presenter';

@Injectable()
export class UpdateRoleUseCase {
  constructor(
    private readonly rolesRepository: RolesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(roleId: string, command: UpdateRoleDto): Promise<RoleResponseDto> {
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

    const nextName = command.name?.trim() ?? role.name;
    const nextKey = command.name ? normalizeRoleKey(command.name) : undefined;

    if (nextKey) {
      const existing = await this.rolesRepository.findVisibleRoleByKey(
        scope.schoolId,
        nextKey,
        role.id,
      );
      if (existing) {
        throw new RoleNameTakenException(nextName);
      }
    }

    const updated = await this.rolesRepository.updateCustomRole(role.id, {
      ...(nextKey ? { key: nextKey } : {}),
      ...(command.name ? { name: nextName } : {}),
      ...(command.description !== undefined
        ? { description: command.description?.trim() ?? null }
        : {}),
    });

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'iam',
      action: 'iam.role.update',
      resourceType: 'role',
      resourceId: updated.id,
      outcome: AuditOutcome.SUCCESS,
      before: {
        key: role.key,
        name: role.name,
        description: role.description ?? null,
      },
      after: {
        key: updated.key,
        name: updated.name,
        description: updated.description ?? null,
      },
    });

    return presentRole(updated);
  }
}
