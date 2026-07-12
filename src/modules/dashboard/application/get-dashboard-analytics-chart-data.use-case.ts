import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/exceptions/domain-exception';
import { AttendanceDashboardAnalyticsRepository } from '../../attendance/reports/infrastructure/attendance-dashboard-analytics.repository';
import { requireDashboardScope } from '../dashboard-context';
import {
  DashboardAnalyticsChartDataFiltersDto,
  DashboardAnalyticsChartDataResponseDto,
  GetDashboardAnalyticsChartDataQueryDto,
} from '../dto/dashboard-analytics-data.dto';
import { findDashboardAnalyticsChartDefinition } from '../domain/dashboard-analytics-catalog';
import {
  buildDashboardEnrollmentStockPlan,
  computeDashboardAdmissionsStudentsAnalyticsData,
} from '../domain/dashboard-admissions-students-analytics';
import { computeDashboardAttendanceAnalyticsData } from '../domain/dashboard-attendance-analytics';
import {
  isDashboardAnalyticsAttendancePackChartKey,
  isDashboardAnalyticsAdmissionsStudentsPackChartKey,
  isDashboardAnalyticsComputedSnapshotChartKey,
} from '../domain/dashboard-analytics-data-pack';
import { normalizeDashboardAnalyticsQuery } from '../domain/dashboard-analytics-query';
import { DashboardAnalyticsSnapshotRepository } from '../infrastructure/dashboard-analytics-snapshot.repository';
import { DashboardAdmissionsAnalyticsRepository } from '../infrastructure/dashboard-admissions-analytics.repository';
import { DashboardStudentsAnalyticsRepository } from '../infrastructure/dashboard-students-analytics.repository';
import { presentDashboardAnalyticsChartData } from '../presenters/dashboard-analytics-data.presenter';
import { DashboardAnalyticsQueryContextService } from './dashboard-analytics-query-context.service';

export const DASHBOARD_ANALYTICS_DATA_DEFAULT_RANGE = '30d' as const;
export const DASHBOARD_ANALYTICS_DATA_DEFAULT_GRANULARITY = 'day' as const;

@Injectable()
export class GetDashboardAnalyticsChartDataUseCase {
  constructor(
    private readonly dashboardAnalyticsQueryContextService: DashboardAnalyticsQueryContextService,
    private readonly dashboardAnalyticsSnapshotRepository: DashboardAnalyticsSnapshotRepository,
    private readonly attendanceDashboardAnalyticsRepository: AttendanceDashboardAnalyticsRepository,
    private readonly dashboardAdmissionsAnalyticsRepository: DashboardAdmissionsAnalyticsRepository,
    private readonly dashboardStudentsAnalyticsRepository: DashboardStudentsAnalyticsRepository,
  ) {}

  async execute(
    chartKey: string,
    query: GetDashboardAnalyticsChartDataQueryDto = new GetDashboardAnalyticsChartDataQueryDto(),
  ): Promise<DashboardAnalyticsChartDataResponseDto> {
    const scope = requireDashboardScope();
    const chart = findDashboardAnalyticsChartDefinition(chartKey);

    if (!chart) {
      throw new NotFoundDomainException(
        'Dashboard analytics chart was not found',
      );
    }

    const queryContext =
      await this.dashboardAnalyticsQueryContextService.resolve(
        scope,
        chart,
        query,
      );

    if (isDashboardAnalyticsComputedSnapshotChartKey(chart.chartKey)) {
      const snapshotValue =
        await this.dashboardAnalyticsSnapshotRepository.loadChartValue(
          scope,
          chart.chartKey,
          queryContext,
        );

      return presentDashboardAnalyticsChartData({
        queryContext,
        chart,
        snapshotValue,
      });
    }

    if (isDashboardAnalyticsAttendancePackChartKey(chart.chartKey)) {
      const sourceInput = {
        scope,
        window: {
          startCivilDate: queryContext.startCivilDate,
          endCivilDate: queryContext.endCivilDate,
        },
        hierarchy: queryContext.hierarchy,
      };
      const attendanceData =
        chart.chartKey === 'attendance.excuse_status'
          ? computeDashboardAttendanceAnalyticsData({
              chartKey: chart.chartKey,
              queryContext,
              excuseAggregates:
                await this.attendanceDashboardAnalyticsRepository.aggregateExcuseStatuses(
                  sourceInput,
                ),
            })
          : computeDashboardAttendanceAnalyticsData({
              chartKey: chart.chartKey,
              queryContext,
              dailyAggregates:
                await this.attendanceDashboardAnalyticsRepository.aggregateDailyEntryStatuses(
                  sourceInput,
                ),
            });

      return presentDashboardAnalyticsChartData({
        queryContext,
        chart,
        attendanceData,
      });
    }

    if (isDashboardAnalyticsAdmissionsStudentsPackChartKey(chart.chartKey)) {
      const hierarchy = queryContext.hierarchy;
      const admissionsHierarchy = {
        academicYearId: hierarchy.academicYearId,
        gradeId: hierarchy.gradeId,
      };

      switch (chart.chartKey) {
        case 'admissions.applications_by_status': {
          const admissionsStudentsData =
            computeDashboardAdmissionsStudentsAnalyticsData({
              chartKey: chart.chartKey,
              queryContext,
              applicationStatusAggregates:
                await this.dashboardAdmissionsAnalyticsRepository.countCurrentApplicationsByStatus(
                  { scope, hierarchy: admissionsHierarchy },
                ),
            });
          return presentDashboardAnalyticsChartData({
            queryContext,
            chart,
            admissionsStudentsData,
          });
        }

        case 'admissions.applications_over_time': {
          const admissionsStudentsData =
            computeDashboardAdmissionsStudentsAnalyticsData({
              chartKey: chart.chartKey,
              queryContext,
              applicationEventAggregates:
                await this.dashboardAdmissionsAnalyticsRepository.aggregateApplicationEventsByCivilDate(
                  {
                    scope,
                    timezone: queryContext.timezone,
                    window: queryContext,
                    hierarchy: admissionsHierarchy,
                  },
                ),
            });
          return presentDashboardAnalyticsChartData({
            queryContext,
            chart,
            admissionsStudentsData,
          });
        }

        case 'students.enrollment_growth': {
          const enrollmentStockPlan =
            buildDashboardEnrollmentStockPlan(queryContext);
          const admissionsStudentsData =
            computeDashboardAdmissionsStudentsAnalyticsData({
              chartKey: chart.chartKey,
              queryContext,
              enrollmentStockPlan,
              enrollmentStockAggregates:
                await this.dashboardStudentsAnalyticsRepository.countActiveEnrollmentsAtBucketCloses(
                  {
                    scope,
                    evaluations: enrollmentStockPlan.evaluations,
                    hierarchy,
                  },
                ),
            });
          return presentDashboardAnalyticsChartData({
            queryContext,
            chart,
            admissionsStudentsData,
          });
        }

        case 'students.withdrawal_trend': {
          const admissionsStudentsData =
            computeDashboardAdmissionsStudentsAnalyticsData({
              chartKey: chart.chartKey,
              queryContext,
              withdrawalAggregates:
                await this.dashboardStudentsAnalyticsRepository.aggregateWithdrawalsByCivilDate(
                  {
                    scope,
                    timezone: queryContext.timezone,
                    window: queryContext,
                    hierarchy,
                  },
                ),
            });
          return presentDashboardAnalyticsChartData({
            queryContext,
            chart,
            admissionsStudentsData,
          });
        }

        case 'students.guardian_coverage': {
          const admissionsStudentsData =
            computeDashboardAdmissionsStudentsAnalyticsData({
              chartKey: chart.chartKey,
              queryContext,
              guardianCoverage:
                await this.dashboardStudentsAnalyticsRepository.countCurrentGuardianCoverage(
                  { scope, hierarchy },
                ),
            });
          return presentDashboardAnalyticsChartData({
            queryContext,
            chart,
            admissionsStudentsData,
          });
        }
      }
    }

    return presentDashboardAnalyticsChartData({ queryContext, chart });
  }
}

export function normalizeDashboardAnalyticsChartDataQuery(
  query: GetDashboardAnalyticsChartDataQueryDto,
): DashboardAnalyticsChartDataFiltersDto {
  return normalizeDashboardAnalyticsQuery(query);
}
