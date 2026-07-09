import { Injectable } from '@nestjs/common';
import { requireDashboardScope } from '../dashboard-context';
import {
  DASHBOARD_MODULE_DEFAULT_LIMIT,
  DASHBOARD_MODULE_MAX_LIMIT,
  DASHBOARD_MODULE_SOURCES,
  DASHBOARD_MODULE_STATUSES,
  DashboardModulesResponseDto,
  ListDashboardModulesQueryDto,
} from '../dto/dashboard-modules.dto';
import {
  DashboardModuleSource,
  DashboardModuleStatus,
} from '../domain/dashboard-module-pages';
import { DashboardAlertsRepository } from '../infrastructure/dashboard-alerts.repository';
import { presentDashboardModules } from '../presenters/dashboard-modules.presenter';
import {
  buildDashboardAlerts,
  buildDashboardAlertsDateWindow,
} from './list-dashboard-alerts.use-case';

export interface NormalizedDashboardModulesQuery {
  status?: DashboardModuleStatus;
  source?: DashboardModuleSource;
  limit: number;
}

@Injectable()
export class ListDashboardModulesUseCase {
  constructor(
    private readonly dashboardAlertsRepository: DashboardAlertsRepository,
  ) {}

  async execute(
    query: ListDashboardModulesQueryDto = new ListDashboardModulesQueryDto(),
  ): Promise<DashboardModulesResponseDto> {
    const scope = requireDashboardScope();
    const generatedAt = new Date();
    const alertSignals = await this.dashboardAlertsRepository.loadAlertSignals(
      scope,
      buildDashboardAlertsDateWindow(generatedAt),
    );

    return presentDashboardModules({
      generatedAt,
      alerts: buildDashboardAlerts(alertSignals),
      filters: normalizeDashboardModulesQuery(query),
    });
  }
}

export function normalizeDashboardModulesQuery(
  query: ListDashboardModulesQueryDto,
): NormalizedDashboardModulesQuery {
  return {
    status: isDashboardModuleStatus(query.status) ? query.status : undefined,
    source: isDashboardModuleSource(query.source) ? query.source : undefined,
    limit: normalizeDashboardModulesLimit(query.limit),
  };
}

function normalizeDashboardModulesLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return DASHBOARD_MODULE_DEFAULT_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), DASHBOARD_MODULE_MAX_LIMIT);
}

function isDashboardModuleStatus(
  value: unknown,
): value is DashboardModuleStatus {
  return (
    typeof value === 'string' &&
    (DASHBOARD_MODULE_STATUSES as readonly string[]).includes(value)
  );
}

function isDashboardModuleSource(
  value: unknown,
): value is DashboardModuleSource {
  return (
    typeof value === 'string' &&
    (DASHBOARD_MODULE_SOURCES as readonly string[]).includes(value)
  );
}
