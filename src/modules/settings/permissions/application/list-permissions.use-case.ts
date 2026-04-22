import { Injectable } from '@nestjs/common';
import { PermissionResponseDto } from '../dto/permission-response.dto';
import { PermissionsRepository } from '../infrastructure/permissions.repository';
import { presentPermission } from '../presenters/permissions.presenter';

@Injectable()
export class ListPermissionsUseCase {
  constructor(
    private readonly permissionsRepository: PermissionsRepository,
  ) {}

  async execute(): Promise<PermissionResponseDto[]> {
    const permissions = await this.permissionsRepository.listPermissions();
    return permissions.map(presentPermission);
  }
}
