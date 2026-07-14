import { Injectable } from '@nestjs/common';
import { DashboardScope } from '../dashboard-context';
import {
  addDashboardCivilDays,
  dashboardCivilDateToPrismaDate,
  DashboardTimeContext,
} from '../domain/dashboard-time-context';
import {
  buildDashboardWidgetCompositionPlan,
  DashboardWidgetAnalyticsChartKey,
} from '../domain/dashboard-widget-composition';
import { DashboardWidgetDefinition } from '../domain/dashboard-widget-registry';
import { DashboardWidgetDto } from '../dto/dashboard-widgets.dto';
import { DashboardActivityFeedItemDto } from '../dto/dashboard-activity-feed.dto';
import { DashboardActivityFeedRepository } from '../infrastructure/dashboard-activity-feed.repository';
import { DashboardAlertsRepository } from '../infrastructure/dashboard-alerts.repository';
import { DashboardSummaryRepository } from '../infrastructure/dashboard-summary.repository';
import { DashboardTodosRepository } from '../infrastructure/dashboard-todos.repository';
import { DashboardPlannerCalendarRepository } from '../infrastructure/dashboard-planner-calendar.repository';
import { DashboardPlannerItemsRepository } from '../infrastructure/dashboard-planner-items.repository';
import { buildDashboardWidgetRegistry } from '../presenters/dashboard-widgets.presenter';
import { buildDashboardSummaryDateWindow } from './get-dashboard-summary.use-case';
import { buildDashboardAlertsDateWindow } from './list-dashboard-alerts.use-case';
import {
  compareDashboardActivityItems,
  mapAuditRecordToDashboardActivity,
} from './list-dashboard-activity-feed.use-case';
import { toDashboardTodoDate } from './dashboard-todo.helpers';
import { GetDashboardAnalyticsChartDataUseCase } from './get-dashboard-analytics-chart-data.use-case';

@Injectable()
export class DashboardWidgetCompositionService {
  constructor(
    private readonly dashboardSummaryRepository: DashboardSummaryRepository,
    private readonly dashboardAlertsRepository: DashboardAlertsRepository,
    private readonly dashboardActivityFeedRepository: DashboardActivityFeedRepository,
    private readonly dashboardTodosRepository: DashboardTodosRepository,
    private readonly getDashboardAnalyticsChartDataUseCase: GetDashboardAnalyticsChartDataUseCase,
    private readonly dashboardPlannerCalendarRepository: DashboardPlannerCalendarRepository,
    private readonly dashboardPlannerItemsRepository: DashboardPlannerItemsRepository,
  ) {}

  async compose(input: {
    scope: DashboardScope;
    timeContext: DashboardTimeContext;
    definitions: readonly DashboardWidgetDefinition[];
  }): Promise<DashboardWidgetDto[]> {
    const plan = buildDashboardWidgetCompositionPlan(input.definitions);
    const todoDate = toDashboardTodoDate(input.timeContext.civilDate);

    const [
      summary,
      alertSignals,
      activityAuditRecords,
      todos,
      calendarEvents,
      plannerItems,
    ] = await Promise.all([
      plan.loadSummary
        ? this.dashboardSummaryRepository.loadSummarySnapshot(
            input.scope,
            buildDashboardSummaryDateWindow(input.timeContext),
          )
        : null,
      plan.loadAlerts
        ? this.dashboardAlertsRepository.loadAlertSignals(
            input.scope,
            buildDashboardAlertsDateWindow(input.timeContext),
          )
        : null,
      plan.loadActivity
        ? this.dashboardActivityFeedRepository.listActivityAuditRecords(
            input.scope,
            { take: 20 },
          )
        : [],
      plan.loadTodos
        ? Promise.all([
            this.dashboardTodosRepository.listOwnedTodos(input.scope, {
              date: todoDate,
              limit: 5,
            }),
            this.dashboardTodosRepository.countOwnedTodos(
              input.scope,
              todoDate,
            ),
          ])
        : null,
      plan.loadCalendar
        ? this.dashboardPlannerCalendarRepository.listSchoolEvents(
            input.scope,
            {
              from: input.timeContext.todayStart,
              toExclusive: input.timeContext.todayEndExclusive,
              allDayFrom: input.timeContext.todayDate,
              allDayToExclusive: dashboardCivilDateToPrismaDate(
                addDashboardCivilDays(input.timeContext.civilDate, 1),
              ),
              limit: 5,
            },
          )
        : null,
      plan.loadPlannerItems
        ? this.dashboardPlannerItemsRepository.listSchoolItems(input.scope, {
            from: input.timeContext.todayStart,
            toExclusive: input.timeContext.todayEndExclusive,
            allDayFrom: input.timeContext.todayDate,
            allDayToExclusive: dashboardCivilDateToPrismaDate(
              addDashboardCivilDays(input.timeContext.civilDate, 1),
            ),
            limit: 5,
          })
        : null,
    ]);

    const analytics = await Promise.all(
      plan.analytics.map(async (binding) => {
        const academicYearId = summary?.academicContext.academicYear?.id;
        const termId = summary?.academicContext.term?.id;
        if (
          binding.chartKey === 'grades.gradebook_completion' &&
          (!academicYearId || !termId)
        ) {
          return {
            chartKey: binding.chartKey,
            response: null,
            unavailableReason: 'academic_context_required' as const,
          };
        }

        const query =
          binding.chartKey === 'grades.gradebook_completion'
            ? {
                range: binding.range,
                granularity: binding.granularity,
                academicYearId: academicYearId!,
                termId: termId!,
              }
            : {
                range: binding.range,
                granularity: binding.granularity,
              };

        return {
          chartKey: binding.chartKey,
          response: await this.getDashboardAnalyticsChartDataUseCase.execute(
            binding.chartKey,
            query,
            input.timeContext.generatedAt,
          ),
          unavailableReason: null,
        };
      }),
    );

    const activityItems = activityAuditRecords
      .map(mapAuditRecordToDashboardActivity)
      .filter((item): item is DashboardActivityFeedItemDto => item !== null)
      .sort(compareDashboardActivityItems)
      .slice(0, 5);
    const analyticsByChartKey = new Map(
      analytics
        .filter(
          (
            result,
          ): result is typeof result & {
            response: NonNullable<typeof result.response>;
          } => result.response !== null,
        )
        .map(({ chartKey, response }) => [chartKey, response] as const),
    ) as ReadonlyMap<
      DashboardWidgetAnalyticsChartKey,
      NonNullable<(typeof analytics)[number]['response']>
    >;
    const analyticsUnavailableByChartKey = new Map(
      analytics
        .filter(
          (
            result,
          ): result is typeof result & {
            unavailableReason: 'academic_context_required';
          } => result.unavailableReason !== null,
        )
        .map(
          ({ chartKey, unavailableReason }) =>
            [chartKey, unavailableReason] as const,
        ),
    );

    return buildDashboardWidgetRegistry({
      generatedAt: input.timeContext.generatedAt,
      definitions: input.definitions,
      summary,
      alertSignals,
      activityItems,
      analyticsByChartKey,
      analyticsUnavailableByChartKey,
      todos: todos
        ? {
            date: input.timeContext.civilDate,
            items: todos[0],
            counts: todos[1],
          }
        : null,
      calendar: calendarEvents
        ? {
            date: input.timeContext.civilDate,
            timezone: input.timeContext.timezone,
            events: calendarEvents,
          }
        : null,
      plannerItems: plannerItems
        ? {
            date: input.timeContext.civilDate,
            timezone: input.timeContext.timezone,
            items: plannerItems,
          }
        : null,
    });
  }
}
