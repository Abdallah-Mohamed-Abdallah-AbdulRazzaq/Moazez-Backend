import { Injectable } from '@nestjs/common';
import { PlatformScope } from '../../../common/decorators/platform-scope.decorator';
import { PlatformAdminOverviewResponseDto } from '../dto/platform-admin-overview.dto';
import { PlatformAdminRepository } from '../infrastructure/platform-admin.repository';
import { requirePlatformAdminScope } from '../platform-admin-context';
import { presentPlatformAdminOverview } from '../presenters/platform-admin.presenter';

@Injectable()
@PlatformScope()
export class GetPlatformAdminOverviewUseCase {
  constructor(
    private readonly platformAdminRepository: PlatformAdminRepository,
  ) {}

  async execute(): Promise<PlatformAdminOverviewResponseDto> {
    requirePlatformAdminScope();

    const counts = await this.platformAdminRepository.loadOverviewCounts();

    return presentPlatformAdminOverview({
      generatedAt: new Date(),
      counts,
    });
  }
}
