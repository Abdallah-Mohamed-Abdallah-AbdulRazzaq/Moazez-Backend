import { Injectable } from '@nestjs/common';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { PlatformSchoolEntitlementResponseDto } from '../dto/platform-admin-entitlement.dto';
import { PlatformSchoolNotFoundException } from '../domain/platform-admin-errors';
import { PlatformAdminEntitlementsRepository } from '../infrastructure/platform-admin-entitlements.repository';
import { requirePlatformAdminScope } from '../platform-admin-context';
import { presentPlatformSchoolEntitlement } from '../presenters/platform-admin-entitlement.presenter';

@Injectable()
@PlatformScope()
export class GetSchoolEntitlementUseCase {
  constructor(
    private readonly entitlementsRepository: PlatformAdminEntitlementsRepository,
  ) {}

  async execute(
    schoolId: string,
  ): Promise<PlatformSchoolEntitlementResponseDto> {
    requirePlatformAdminScope();

    const school = await this.entitlementsRepository.findSchoolById(schoolId);
    if (!school) {
      throw new PlatformSchoolNotFoundException(schoolId);
    }

    const [entitlement, activeStudentSeatUsage] = await Promise.all([
      this.entitlementsRepository.findEntitlementBySchoolId(schoolId),
      this.entitlementsRepository.countActiveStudentSeats(schoolId),
    ]);

    return presentPlatformSchoolEntitlement({
      school,
      entitlement,
      activeStudentSeatUsage,
    });
  }
}
