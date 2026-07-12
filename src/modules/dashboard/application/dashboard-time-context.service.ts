import { Injectable } from '@nestjs/common';
import { DashboardScope } from '../dashboard-context';
import {
  DashboardTimeContext,
  buildDashboardTimeContext,
} from '../domain/dashboard-time-context';
import { DashboardTimeContextRepository } from '../infrastructure/dashboard-time-context.repository';

@Injectable()
export class DashboardTimeContextService {
  constructor(
    private readonly dashboardTimeContextRepository: DashboardTimeContextRepository,
  ) {}

  async resolveForSchool(
    scope: DashboardScope,
    generatedAt: Date = new Date(),
  ): Promise<DashboardTimeContext> {
    const schoolTimezone =
      await this.dashboardTimeContextRepository.loadSchoolTimezone(scope);

    return buildDashboardTimeContext({ generatedAt, schoolTimezone });
  }
}
