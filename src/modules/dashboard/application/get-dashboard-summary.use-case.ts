import { Injectable } from '@nestjs/common';
import { requireDashboardScope } from '../dashboard-context';
import { DashboardTimeContext } from '../domain/dashboard-time-context';
import { DashboardSummaryResponseDto } from '../dto/dashboard-summary.dto';
import {
  DashboardSummaryDateWindow,
  DashboardSummaryRepository,
} from '../infrastructure/dashboard-summary.repository';
import { presentDashboardSummary } from '../presenters/dashboard-summary.presenter';
import { DashboardTimeContextService } from './dashboard-time-context.service';

@Injectable()
export class GetDashboardSummaryUseCase {
  constructor(
    private readonly dashboardSummaryRepository: DashboardSummaryRepository,
    private readonly dashboardTimeContextService: DashboardTimeContextService,
  ) {}

  async execute(): Promise<DashboardSummaryResponseDto> {
    const scope = requireDashboardScope();
    const timeContext =
      await this.dashboardTimeContextService.resolveForSchool(scope);
    const window = buildDashboardSummaryDateWindow(timeContext);
    const snapshot = await this.dashboardSummaryRepository.loadSummarySnapshot(
      scope,
      window,
    );

    return presentDashboardSummary(snapshot, timeContext.timezone);
  }
}

export function buildDashboardSummaryDateWindow(
  timeContext: DashboardTimeContext,
): DashboardSummaryDateWindow {
  return {
    now: timeContext.generatedAt,
    todayDate: timeContext.todayDate,
    todayStart: timeContext.todayStart,
    todayEndExclusive: timeContext.todayEndExclusive,
    last7DaysStart: timeContext.last7DaysStart,
    last30DaysStart: timeContext.last30DaysStart,
  };
}
