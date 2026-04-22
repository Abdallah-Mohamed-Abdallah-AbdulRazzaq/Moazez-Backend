import { Injectable } from '@nestjs/common';
import { requireSettingsScope } from '../../settings-context';
import { OverviewResponseDto } from '../dto/overview-response.dto';
import { OverviewRepository } from '../infrastructure/overview.repository';
import { presentOverview } from '../presenters/overview.presenter';

@Injectable()
export class GetOverviewUseCase {
  constructor(private readonly overviewRepository: OverviewRepository) {}

  async execute(): Promise<OverviewResponseDto> {
    const scope = requireSettingsScope();
    const [metrics, auditEvents] = await Promise.all([
      this.overviewRepository.getMetrics(scope.schoolId),
      this.overviewRepository.listRecentAuditEvents(scope.schoolId),
    ]);

    return presentOverview(metrics, auditEvents);
  }
}
