import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import {
  CreatePlatformSchoolDto,
  PlatformSchoolResponseDto,
} from '../dto/platform-admin-school.dto';
import {
  PlatformOrganizationNotFoundException,
  PlatformSchoolSlugTakenException,
} from '../domain/platform-admin-errors';
import {
  assertOrganizationCanReceiveSchool,
  normalizePlatformName,
  normalizePlatformSlug,
} from '../domain/platform-admin-inputs';
import { PlatformAdminRepository } from '../infrastructure/platform-admin.repository';
import { requirePlatformAdminScope } from '../platform-admin-context';
import { presentPlatformSchool } from '../presenters/platform-admin.presenter';

@Injectable()
@PlatformScope()
export class CreatePlatformSchoolUseCase {
  constructor(
    private readonly platformAdminRepository: PlatformAdminRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    organizationId: string,
    command: CreatePlatformSchoolDto,
  ): Promise<PlatformSchoolResponseDto> {
    const scope = requirePlatformAdminScope();
    const organization =
      await this.platformAdminRepository.findOrganizationById(organizationId);
    if (!organization) {
      throw new PlatformOrganizationNotFoundException(organizationId);
    }
    assertOrganizationCanReceiveSchool({
      organizationId,
      status: organization.status,
    });

    const name = normalizePlatformName(command.name);
    const slug = normalizePlatformSlug(command.slug);

    const existing = await this.platformAdminRepository.findSchoolBySlug({
      organizationId,
      slug,
    });
    if (existing) {
      throw new PlatformSchoolSlugTakenException(organizationId, slug);
    }

    const school = await this.platformAdminRepository.createSchool({
      organizationId,
      name,
      slug,
    });

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: school.organizationId,
      schoolId: school.id,
      module: 'platform_admin',
      action: 'platform.school.create',
      resourceType: 'school',
      resourceId: school.id,
      outcome: AuditOutcome.SUCCESS,
      after: {
        organizationId: school.organizationId,
        schoolId: school.id,
        name: school.name,
        slug: school.slug,
        status: school.status,
      },
    });

    return presentPlatformSchool(school);
  }
}
