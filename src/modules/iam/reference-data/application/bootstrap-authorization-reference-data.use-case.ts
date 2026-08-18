import { Injectable } from '@nestjs/common';
import { ReferenceDataBootstrapError } from '../reference-data-bootstrap.errors';
import { AuthorizationReferenceDataRepository } from '../infrastructure/authorization-reference-data.repository';

export interface BootstrapAuthorizationReferenceDataResult {
  status: 'PASS';
  permissionsReady: true;
  systemRolesReady: true;
  platformSuperAdminReady: true;
  permissionCount: number;
  systemRoleCount: number;
  platformSuperAdminPermissionCount: number;
  userMutation: false;
}

@Injectable()
export class BootstrapAuthorizationReferenceDataUseCase {
  constructor(
    private readonly repository: AuthorizationReferenceDataRepository,
  ) {}

  async execute(): Promise<BootstrapAuthorizationReferenceDataResult> {
    await this.repository.converge();
    const verification = await this.repository.verify();
    if (!verification.ready) {
      throw new ReferenceDataBootstrapError('REFERENCE_DATA_DRIFT');
    }

    return {
      status: 'PASS',
      permissionsReady: true,
      systemRolesReady: true,
      platformSuperAdminReady: true,
      permissionCount: verification.permissionCount,
      systemRoleCount: verification.systemRoleCount,
      platformSuperAdminPermissionCount:
        verification.platformSuperAdminPermissionCount,
      userMutation: false,
    };
  }
}
