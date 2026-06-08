import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import {
  CreatePlatformOrganizationDto,
  PlatformOrganizationResponseDto,
} from '../dto/platform-admin-organization.dto';
import { PlatformOrganizationSlugTakenException } from '../domain/platform-admin-errors';
import {
  normalizePlatformName,
  normalizePlatformSlug,
} from '../domain/platform-admin-inputs';
import { PlatformAdminRepository } from '../infrastructure/platform-admin.repository';
import { requirePlatformAdminScope } from '../platform-admin-context';
import { presentPlatformOrganization } from '../presenters/platform-admin.presenter';

@Injectable()
@PlatformScope()
export class CreatePlatformOrganizationUseCase {
  constructor(
    private readonly platformAdminRepository: PlatformAdminRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    command: CreatePlatformOrganizationDto,
  ): Promise<PlatformOrganizationResponseDto> {
    const scope = requirePlatformAdminScope();
    const name = normalizePlatformName(command.name);
    const slug = normalizePlatformSlug(command.slug);

    const existing =
      await this.platformAdminRepository.findOrganizationBySlug(slug);
    if (existing) {
      throw new PlatformOrganizationSlugTakenException(slug);
    }

    const organization =
      await this.platformAdminRepository.createOrganization({ name, slug });

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: organization.id,
      schoolId: null,
      module: 'platform_admin',
      action: 'platform.organization.create',
      resourceType: 'organization',
      resourceId: organization.id,
      outcome: AuditOutcome.SUCCESS,
      after: {
        organizationId: organization.id,
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
      },
    });

    return presentPlatformOrganization(organization);
  }
}
