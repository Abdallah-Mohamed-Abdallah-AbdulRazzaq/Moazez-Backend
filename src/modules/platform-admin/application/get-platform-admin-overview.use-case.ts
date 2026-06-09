import { Injectable } from '@nestjs/common';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { PlatformAdminOverviewResponseDto } from '../dto/platform-admin-overview.dto';
import { PlatformAdminEntitlementsRepository } from '../infrastructure/platform-admin-entitlements.repository';
import { PlatformAdminFeaturesRepository } from '../infrastructure/platform-admin-features.repository';
import { PlatformAdminRepository } from '../infrastructure/platform-admin.repository';
import { requirePlatformAdminScope } from '../platform-admin-context';
import { presentPlatformAdminOverview } from '../presenters/platform-admin.presenter';

@Injectable()
@PlatformScope()
export class GetPlatformAdminOverviewUseCase {
  constructor(
    private readonly platformAdminRepository: PlatformAdminRepository,
    private readonly entitlementsRepository: PlatformAdminEntitlementsRepository,
    private readonly featuresRepository: PlatformAdminFeaturesRepository,
  ) {}

  async execute(): Promise<PlatformAdminOverviewResponseDto> {
    requirePlatformAdminScope();

    const [counts, entitlements, features] = await Promise.all([
      this.platformAdminRepository.loadOverviewCounts(),
      this.entitlementsRepository.loadOverviewCounters(),
      this.featuresRepository.loadOverviewCounters(),
    ]);

    return presentPlatformAdminOverview({
      generatedAt: new Date(),
      counts,
      entitlements,
      features,
    });
  }
}
