import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { requireDashboardScope } from '../dashboard-context';
import { DashboardWidgetResponseDto } from '../dto/dashboard-widgets.dto';
import { findDashboardWidgetDefinition } from '../domain/dashboard-widget-registry';
import { presentDashboardWidget } from '../presenters/dashboard-widgets.presenter';
import { DashboardTimeContextService } from './dashboard-time-context.service';
import { DashboardWidgetCompositionService } from './dashboard-widget-composition.service';

@Injectable()
export class GetDashboardWidgetUseCase {
  constructor(
    private readonly dashboardTimeContextService: DashboardTimeContextService,
    private readonly dashboardWidgetCompositionService: DashboardWidgetCompositionService,
  ) {}

  async execute(widgetKey: string): Promise<DashboardWidgetResponseDto> {
    const definition = findDashboardWidgetDefinition(widgetKey);
    if (!definition) {
      throw new NotFoundDomainException('Dashboard widget was not found');
    }

    const scope = requireDashboardScope();
    const timeContext =
      await this.dashboardTimeContextService.resolveForSchool(scope);
    const [widget] = await this.dashboardWidgetCompositionService.compose({
      scope,
      timeContext,
      definitions: [definition],
    });

    return presentDashboardWidget({
      generatedAt: timeContext.generatedAt,
      widget,
    });
  }
}
