import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import {
  PlatformOrganizationResponseDto,
  UpdatePlatformOrganizationDto,
} from '../dto/platform-admin-organization.dto';
import {
  PlatformOrganizationNotFoundException,
  PlatformOrganizationSlugTakenException,
} from '../domain/platform-admin-errors';
import {
  assertOrganizationCanMutate,
  normalizeOptionalPlatformName,
  normalizeOptionalPlatformSlug,
} from '../domain/platform-admin-inputs';
import { PlatformAdminRepository } from '../infrastructure/platform-admin.repository';
import { requirePlatformAdminScope } from '../platform-admin-context';
import { presentPlatformOrganization } from '../presenters/platform-admin.presenter';

@Injectable()
@PlatformScope()
export class UpdatePlatformOrganizationUseCase {
  constructor(
    private readonly platformAdminRepository: PlatformAdminRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    organizationId: string,
    command: UpdatePlatformOrganizationDto,
  ): Promise<PlatformOrganizationResponseDto> {
    const scope = requirePlatformAdminScope();
    const existing =
      await this.platformAdminRepository.findOrganizationById(organizationId);
    if (!existing) {
      throw new PlatformOrganizationNotFoundException(organizationId);
    }
    assertOrganizationCanMutate({
      organizationId,
      status: existing.status,
    });

    const name = normalizeOptionalPlatformName(command.name);
    const slug = normalizeOptionalPlatformSlug(command.slug);

    if (name === undefined && slug === undefined) {
      throw new ValidationDomainException('Organization update is empty', {
        organizationId,
      });
    }

    if (slug !== undefined && slug !== existing.slug) {
      const duplicate =
        await this.platformAdminRepository.findOrganizationBySlug(slug);
      if (duplicate && duplicate.id !== organizationId) {
        throw new PlatformOrganizationSlugTakenException(slug);
      }
    }

    const changedFields = [
      ...(name !== undefined && name !== existing.name ? ['name'] : []),
      ...(slug !== undefined && slug !== existing.slug ? ['slug'] : []),
    ];

    if (changedFields.length === 0) {
      return presentPlatformOrganization(existing);
    }

    const organization =
      await this.platformAdminRepository.updateOrganization({
        organizationId,
        name,
        slug,
      });

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: organization.id,
      schoolId: null,
      module: 'platform_admin',
      action: 'platform.organization.update',
      resourceType: 'organization',
      resourceId: organization.id,
      outcome: AuditOutcome.SUCCESS,
      before: {
        name: existing.name,
        slug: existing.slug,
      },
      after: {
        changedFields,
        name: organization.name,
        slug: organization.slug,
      },
    });

    return presentPlatformOrganization(organization);
  }
}
