import { Injectable } from '@nestjs/common';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { PlatformAdminOverviewResponseDto } from '../dto/platform-admin-overview.dto';
import { PlatformAdminEntitlementsRepository } from '../infrastructure/platform-admin-entitlements.repository';
import { PlatformAdminRepository } from '../infrastructure/platform-admin.repository';
import { requirePlatformAdminScope } from '../platform-admin-context';
import { presentPlatformAdminOverview } from '../presenters/platform-admin.presenter';

@Injectable()
@PlatformScope()
export class GetPlatformAdminOverviewUseCase {
  constructor(
    private readonly platformAdminRepository: PlatformAdminRepository,
    private readonly entitlementsRepository: PlatformAdminEntitlementsRepository,
  ) {}

  async execute(): Promise<PlatformAdminOverviewResponseDto> {
    requirePlatformAdminScope();

    const [counts, entitlements] = await Promise.all([
      this.platformAdminRepository.loadOverviewCounts(),
      this.entitlementsRepository.loadOverviewCounters(),
    ]);

    return presentPlatformAdminOverview({
      generatedAt: new Date(),
      counts,
      entitlements,
    });
  }
}
