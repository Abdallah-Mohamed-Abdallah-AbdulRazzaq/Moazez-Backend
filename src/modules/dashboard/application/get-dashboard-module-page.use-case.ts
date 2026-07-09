import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { DashboardScope, requireDashboardScope } from '../dashboard-context';
import { DashboardModulePageResponseDto } from '../dto/dashboard-modules.dto';
import { findDashboardModulePageDefinition } from '../domain/dashboard-module-pages';
import { DashboardAlertsRepository } from '../infrastructure/dashboard-alerts.repository';
import { DashboardSummaryRepository } from '../infrastructure/dashboard-summary.repository';
import { presentDashboardModulePage } from '../presenters/dashboard-modules.presenter';
import {
  buildDashboardAlerts,
  buildDashboardAlertsDateWindow,
} from './list-dashboard-alerts.use-case';
import { buildDashboardSummaryDateWindow } from './get-dashboard-summary.use-case';

@Injectable()
export class GetDashboardModulePageUseCase {
  constructor(
    private readonly dashboardSummaryRepository: DashboardSummaryRepository,
    private readonly dashboardAlertsRepository: DashboardAlertsRepository,
  ) {}

  async execute(moduleKey: string): Promise<DashboardModulePageResponseDto> {
    const scope = requireDashboardScope();
    const definition = findDashboardModulePageDefinition(moduleKey);

    if (!definition) {
      throw new NotFoundDomainException(
        'Dashboard module page was not found',
      );
    }

    return this.loadModulePage(scope, definition.moduleKey);
  }

  private async loadModulePage(
    scope: DashboardScope,
    moduleKey: string,
  ): Promise<DashboardModulePageResponseDto> {
    const generatedAt = new Date();
    const definition = findDashboardModulePageDefinition(moduleKey);

    if (!definition) {
      throw new NotFoundDomainException(
        'Dashboard module page was not found',
      );
    }

    const [summary, alertSignals] = await Promise.all([
      this.dashboardSummaryRepository.loadSummarySnapshot(
        scope,
        buildDashboardSummaryDateWindow(generatedAt),
      ),
      this.dashboardAlertsRepository.loadAlertSignals(
        scope,
        buildDashboardAlertsDateWindow(generatedAt),
      ),
    ]);

    return presentDashboardModulePage({
      generatedAt,
      definition,
      summary,
      alertSignals,
      alerts: buildDashboardAlerts(alertSignals),
    });
  }
}
