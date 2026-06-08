import { Injectable } from '@nestjs/common';
import { AuditOutcome } from '@prisma/client';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { ValidationDomainException } from '../../../common/exceptions/domain-exception';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import {
  PlatformSchoolResponseDto,
  UpdatePlatformSchoolDto,
} from '../dto/platform-admin-school.dto';
import {
  PlatformSchoolNotFoundException,
  PlatformSchoolSlugTakenException,
} from '../domain/platform-admin-errors';
import {
  assertSchoolCanMutate,
  normalizeOptionalPlatformName,
  normalizeOptionalPlatformSlug,
} from '../domain/platform-admin-inputs';
import { PlatformAdminRepository } from '../infrastructure/platform-admin.repository';
import { requirePlatformAdminScope } from '../platform-admin-context';
import { presentPlatformSchool } from '../presenters/platform-admin.presenter';

@Injectable()
@PlatformScope()
export class UpdatePlatformSchoolUseCase {
  constructor(
    private readonly platformAdminRepository: PlatformAdminRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    schoolId: string,
    command: UpdatePlatformSchoolDto,
  ): Promise<PlatformSchoolResponseDto> {
    const scope = requirePlatformAdminScope();
    const existing = await this.platformAdminRepository.findSchoolById(schoolId);
    if (!existing) {
      throw new PlatformSchoolNotFoundException(schoolId);
    }
    assertSchoolCanMutate({ schoolId, status: existing.status });

    const name = normalizeOptionalPlatformName(command.name);
    const slug = normalizeOptionalPlatformSlug(command.slug);

    if (name === undefined && slug === undefined) {
      throw new ValidationDomainException('School update is empty', { schoolId });
    }

    if (slug !== undefined && slug !== existing.slug) {
      const duplicate = await this.platformAdminRepository.findSchoolBySlug({
        organizationId: existing.organizationId,
        slug,
      });
      if (duplicate && duplicate.id !== schoolId) {
        throw new PlatformSchoolSlugTakenException(
          existing.organizationId,
          slug,
        );
      }
    }

    const changedFields = [
      ...(name !== undefined && name !== existing.name ? ['name'] : []),
      ...(slug !== undefined && slug !== existing.slug ? ['slug'] : []),
    ];

    if (changedFields.length === 0) {
      return presentPlatformSchool(existing);
    }

    const school = await this.platformAdminRepository.updateSchool({
      schoolId,
      name,
      slug,
    });

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: school.organizationId,
      schoolId: school.id,
      module: 'platform_admin',
      action: 'platform.school.update',
      resourceType: 'school',
      resourceId: school.id,
      outcome: AuditOutcome.SUCCESS,
      before: {
        name: existing.name,
        slug: existing.slug,
      },
      after: {
        changedFields,
        name: school.name,
        slug: school.slug,
      },
    });

    return presentPlatformSchool(school);
  }
}
