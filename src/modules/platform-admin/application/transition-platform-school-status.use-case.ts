import { Injectable } from '@nestjs/common';
import { AuditOutcome, SchoolStatus } from '@prisma/client';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { AuthRepository } from '../../iam/auth/infrastructure/auth.repository';
import { PlatformSchoolResponseDto } from '../dto/platform-admin-school.dto';
import { PlatformSchoolNotFoundException } from '../domain/platform-admin-errors';
import { assertSchoolCanTransition } from '../domain/platform-admin-inputs';
import { PlatformAdminRepository } from '../infrastructure/platform-admin.repository';
import { requirePlatformAdminScope } from '../platform-admin-context';
import { presentPlatformSchool } from '../presenters/platform-admin.presenter';

@Injectable()
@PlatformScope()
export class TransitionPlatformSchoolStatusUseCase {
  constructor(
    private readonly platformAdminRepository: PlatformAdminRepository,
    private readonly authRepository: AuthRepository,
  ) {}

  async execute(
    schoolId: string,
    targetStatus: SchoolStatus,
  ): Promise<PlatformSchoolResponseDto> {
    const scope = requirePlatformAdminScope();
    const existing = await this.platformAdminRepository.findSchoolById(schoolId);
    if (!existing) {
      throw new PlatformSchoolNotFoundException(schoolId);
    }

    assertSchoolCanTransition({
      schoolId,
      currentStatus: existing.status,
      targetStatus,
    });

    if (existing.status === targetStatus) {
      return presentPlatformSchool(existing);
    }

    const school = await this.platformAdminRepository.updateSchool({
      schoolId,
      status: targetStatus,
    });

    await this.authRepository.createAuditLog({
      actorId: scope.actorId,
      userType: scope.userType,
      organizationId: school.organizationId,
      schoolId: school.id,
      module: 'platform_admin',
      action: `platform.school.${statusAction(targetStatus)}`,
      resourceType: 'school',
      resourceId: school.id,
      outcome: AuditOutcome.SUCCESS,
      before: { status: existing.status },
      after: { status: school.status },
    });

    return presentPlatformSchool(school);
  }
}

function statusAction(status: SchoolStatus): 'activate' | 'suspend' | 'archive' {
  switch (status) {
    case SchoolStatus.ACTIVE:
      return 'activate';
    case SchoolStatus.SUSPENDED:
      return 'suspend';
    case SchoolStatus.ARCHIVED:
      return 'archive';
  }
}
