import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { AuthRepository } from '../../../iam/auth/infrastructure/auth.repository';
import { NotFoundDomainException } from '../../../../common/exceptions/domain-exception';
import { requireSettingsScope } from '../../settings-context';
import { normalizeRoleKey } from '../domain/normalize-role-key';
import { RoleNameTakenException } from '../domain/role.exceptions';
import { CreateRoleDto } from '../dto/create-role.dto';
import { RoleResponseDto } from '../dto/role-response.dto';
import { RolesRepository } from '../infrastructure/roles.repository';
import { presentRole } from '../presenters/roles.presenter';

@Injectable()
export class CreateRoleUseCase {
  constructor(
    private readonly rolesRepository: RolesRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(command: CreateRoleDto): Promise<RoleResponseDto> {
    const scope = requireSettingsScope();
    const key = normalizeRoleKey(command.name);

    const existing = await this.rolesRepository.findVisibleRoleByKey(
      scope.schoolId,
      key,
    );
    if (existing) {
      throw new RoleNameTakenException(command.name);
    }

    const role = await this.rolesRepository.createCustomRole({
      schoolId: scope.schoolId,
      key,
      name: command.name.trim(),
      description: command.description?.trim(),
    });

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: scope.organizationId,
      schoolId: scope.schoolId,
      module: 'iam',
      action: 'iam.role.create',
      resourceType: 'role',
      resourceId: role.id,
      outcome: AuditOutcome.SUCCESS,
      after: {
        key: role.key,
        name: role.name,
        description: role.description ?? null,
        permissions: [],
      },
    });

    return presentRole(role);
  }
}
