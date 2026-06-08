import { Injectable } from '@nestjs/common';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { PlatformOrganizationResponseDto } from '../dto/platform-admin-organization.dto';
import { PlatformOrganizationNotFoundException } from '../domain/platform-admin-errors';
import { PlatformAdminRepository } from '../infrastructure/platform-admin.repository';
import { requirePlatformAdminScope } from '../platform-admin-context';
import { presentPlatformOrganization } from '../presenters/platform-admin.presenter';

@Injectable()
@PlatformScope()
export class GetPlatformOrganizationUseCase {
  constructor(
    private readonly platformAdminRepository: PlatformAdminRepository,
  ) {}

  async execute(organizationId: string): Promise<PlatformOrganizationResponseDto> {
    requirePlatformAdminScope();

    const organization =
      await this.platformAdminRepository.findOrganizationById(organizationId);
    if (!organization) {
      throw new PlatformOrganizationNotFoundException(organizationId);
    }

    return presentPlatformOrganization(organization);
  }
}
