import { Injectable } from '@nestjs/common';
import { requireSettingsScope } from '../../settings-context';
import { RoleResponseDto } from '../dto/role-response.dto';
import { RolesRepository } from '../infrastructure/roles.repository';
import { presentRole } from '../presenters/roles.presenter';

@Injectable()
export class ListRolesUseCase {
  constructor(private readonly rolesRepository: RolesRepository) {}

  async execute(): Promise<RoleResponseDto[]> {
    const scope = requireSettingsScope();
    const roles = await this.rolesRepository.listVisibleRoles(scope.schoolId);
    return roles.map(presentRole);
  }
}
