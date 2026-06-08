import { Injectable } from '@nestjs/common';
import { AuditOutcome, OrganizationStatus } from '@prisma/client';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import { PlatformOrganizationResponseDto } from '../dto/platform-admin-organization.dto';
import { PlatformOrganizationNotFoundException } from '../domain/platform-admin-errors';
import { assertOrganizationCanTransition } from '../domain/platform-admin-inputs';
import { PlatformAdminRepository } from '../infrastructure/platform-admin.repository';
import { requirePlatformAdminScope } from '../platform-admin-context';
import { presentPlatformOrganization } from '../presenters/platform-admin.presenter';

@Injectable()
@PlatformScope()
export class TransitionPlatformOrganizationStatusUseCase {
  constructor(
    private readonly platformAdminRepository: PlatformAdminRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    organizationId: string,
    targetStatus: OrganizationStatus,
  ): Promise<PlatformOrganizationResponseDto> {
    const scope = requirePlatformAdminScope();
    const existing =
      await this.platformAdminRepository.findOrganizationById(organizationId);
    if (!existing) {
      throw new PlatformOrganizationNotFoundException(organizationId);
    }

    assertOrganizationCanTransition({
      organizationId,
      currentStatus: existing.status,
      targetStatus,
    });

    if (existing.status === targetStatus) {
      return presentPlatformOrganization(existing);
    }

    const organization =
      await this.platformAdminRepository.updateOrganization({
        organizationId,
        status: targetStatus,
      });

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: organization.id,
      schoolId: null,
      module: 'platform_admin',
      action: `platform.organization.${statusAction(targetStatus)}`,
      resourceType: 'organization',
      resourceId: organization.id,
      outcome: AuditOutcome.SUCCESS,
      before: { status: existing.status },
      after: { status: organization.status },
    });

    return presentPlatformOrganization(organization);
  }
}

function statusAction(status: OrganizationStatus): 'activate' | 'suspend' | 'archive' {
  switch (status) {
    case OrganizationStatus.ACTIVE:
      return 'activate';
    case OrganizationStatus.SUSPENDED:
      return 'suspend';
    case OrganizationStatus.ARCHIVED:
      return 'archive';
  }
}
