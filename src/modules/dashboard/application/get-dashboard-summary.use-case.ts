import { Injectable } from '@nestjs/common';
import { requireDashboardScope } from '../dashboard-context';
import { DashboardSummaryResponseDto } from '../dto/dashboard-summary.dto';
import {
  DashboardSummaryDateWindow,
  DashboardSummaryRepository,
} from '../infrastructure/dashboard-summary.repository';
import { presentDashboardSummary } from '../presenters/dashboard-summary.presenter';

@Injectable()
export class GetDashboardSummaryUseCase {
  constructor(
    private readonly dashboardSummaryRepository: DashboardSummaryRepository,
  ) {}

  async execute(): Promise<DashboardSummaryResponseDto> {
    const scope = requireDashboardScope();
    const window = buildDashboardSummaryDateWindow(new Date());
    const snapshot = await this.dashboardSummaryRepository.loadSummarySnapshot(
      scope,
      window,
    );

    return presentDashboardSummary(snapshot);
  }
}

export function buildDashboardSummaryDateWindow(
  now: Date,
): DashboardSummaryDateWindow {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const last7DaysStart = new Date(now);
  last7DaysStart.setDate(last7DaysStart.getDate() - 7);

  const last30DaysStart = new Date(now);
  last30DaysStart.setDate(last30DaysStart.getDate() - 30);

  return {
    now,
    todayStart,
    last7DaysStart,
    last30DaysStart,
  };
}
