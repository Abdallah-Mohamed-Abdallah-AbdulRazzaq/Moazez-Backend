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
import { computeDashboardAcademicsAnalyticsData } from '../domain/dashboard-academics-analytics';
import { computeDashboardGradesHomeworkAnalyticsData } from '../domain/dashboard-grades-homework-analytics';
import { computeDashboardBehaviorReinforcementAnalyticsData } from '../domain/dashboard-behavior-reinforcement-analytics';
import {
  isDashboardAnalyticsAcademicsPackChartKey,
  isDashboardAnalyticsAttendancePackChartKey,
  isDashboardAnalyticsAdmissionsStudentsPackChartKey,
  isDashboardAnalyticsComputedSnapshotChartKey,
  isDashboardAnalyticsGradesHomeworkPackChartKey,
  isDashboardAnalyticsBehaviorReinforcementPackChartKey,
} from '../domain/dashboard-analytics-data-pack';
import { normalizeDashboardAnalyticsQuery } from '../domain/dashboard-analytics-query';
import { DashboardAnalyticsSnapshotRepository } from '../infrastructure/dashboard-analytics-snapshot.repository';
import { DashboardAdmissionsAnalyticsRepository } from '../infrastructure/dashboard-admissions-analytics.repository';
import { DashboardStudentsAnalyticsRepository } from '../infrastructure/dashboard-students-analytics.repository';
import { DashboardAcademicsAnalyticsRepository } from '../infrastructure/dashboard-academics-analytics.repository';
import { DashboardGradesAnalyticsRepository } from '../infrastructure/dashboard-grades-analytics.repository';
import { DashboardHomeworkAnalyticsRepository } from '../infrastructure/dashboard-homework-analytics.repository';
import { DashboardBehaviorAnalyticsRepository } from '../infrastructure/dashboard-behavior-analytics.repository';
import { DashboardReinforcementAnalyticsRepository } from '../infrastructure/dashboard-reinforcement-analytics.repository';
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
    private readonly dashboardAcademicsAnalyticsRepository: DashboardAcademicsAnalyticsRepository,
    private readonly dashboardGradesAnalyticsRepository: DashboardGradesAnalyticsRepository,
    private readonly dashboardHomeworkAnalyticsRepository: DashboardHomeworkAnalyticsRepository,
    private readonly dashboardBehaviorAnalyticsRepository: DashboardBehaviorAnalyticsRepository,
    private readonly dashboardReinforcementAnalyticsRepository: DashboardReinforcementAnalyticsRepository,
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

    if (isDashboardAnalyticsAcademicsPackChartKey(chart.chartKey)) {
      const hierarchy = queryContext.hierarchy;

      switch (chart.chartKey) {
        case 'academics.teacher_allocation_coverage': {
          const academicsData = computeDashboardAcademicsAnalyticsData({
            chartKey: chart.chartKey,
            teacherAllocationCoverage:
              await this.dashboardAcademicsAnalyticsRepository.countTeacherAllocationCoverage(
                { scope, hierarchy },
              ),
          });
          return presentDashboardAnalyticsChartData({
            queryContext,
            chart,
            academicsData,
          });
        }

        case 'academics.timetable_publication_status': {
          const academicsData = computeDashboardAcademicsAnalyticsData({
            chartKey: chart.chartKey,
            timetablePublicationStatus:
              await this.dashboardAcademicsAnalyticsRepository.countCurrentTimetablePublicationStatus(
                { scope, hierarchy },
              ),
          });
          return presentDashboardAnalyticsChartData({
            queryContext,
            chart,
            academicsData,
          });
        }

        case 'academics.curriculum_activation': {
          const academicsData = computeDashboardAcademicsAnalyticsData({
            chartKey: chart.chartKey,
            curriculumActivation:
              await this.dashboardAcademicsAnalyticsRepository.countCurrentCurriculumActivationStatus(
                { scope, hierarchy },
              ),
          });
          return presentDashboardAnalyticsChartData({
            queryContext,
            chart,
            academicsData,
          });
        }

        case 'academics.lesson_plan_activation': {
          const academicsData = computeDashboardAcademicsAnalyticsData({
            chartKey: chart.chartKey,
            lessonPlanActivation:
              await this.dashboardAcademicsAnalyticsRepository.countCurrentLessonPlanActivationStatus(
                { scope, hierarchy },
              ),
          });
          return presentDashboardAnalyticsChartData({
            queryContext,
            chart,
            academicsData,
          });
        }
      }
    }

    if (isDashboardAnalyticsGradesHomeworkPackChartKey(chart.chartKey)) {
      const hierarchy = queryContext.hierarchy;

      switch (chart.chartKey) {
        case 'grades.assessment_status_distribution': {
          const gradesHomeworkData =
            computeDashboardGradesHomeworkAnalyticsData({
              chartKey: chart.chartKey,
              queryContext,
              assessmentStatus:
                await this.dashboardGradesAnalyticsRepository.countCurrentAssessmentStatusDistribution(
                  { scope, hierarchy },
                ),
            });
          return presentDashboardAnalyticsChartData({
            queryContext,
            chart,
            gradesHomeworkData,
          });
        }

        case 'grades.gradebook_completion': {
          const gradesHomeworkData =
            computeDashboardGradesHomeworkAnalyticsData({
              chartKey: chart.chartKey,
              queryContext,
              gradebookCompletion:
                await this.dashboardGradesAnalyticsRepository.countCurrentGradebookCompletion(
                  { scope, hierarchy },
                ),
            });
          return presentDashboardAnalyticsChartData({
            queryContext,
            chart,
            gradesHomeworkData,
          });
        }

        case 'homework.assignment_status_distribution': {
          const gradesHomeworkData =
            computeDashboardGradesHomeworkAnalyticsData({
              chartKey: chart.chartKey,
              queryContext,
              assignmentStatus:
                await this.dashboardHomeworkAnalyticsRepository.countCurrentAssignmentStatusDistribution(
                  { scope, hierarchy },
                ),
            });
          return presentDashboardAnalyticsChartData({
            queryContext,
            chart,
            gradesHomeworkData,
          });
        }

        case 'homework.submission_review_trend': {
          const gradesHomeworkData =
            computeDashboardGradesHomeworkAnalyticsData({
              chartKey: chart.chartKey,
              queryContext,
              submissionReviewEvents:
                await this.dashboardHomeworkAnalyticsRepository.aggregateSubmissionReviewEventsByCivilDate(
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
            gradesHomeworkData,
          });
        }

        case 'homework.grade_sync_coverage': {
          const gradesHomeworkData =
            computeDashboardGradesHomeworkAnalyticsData({
              chartKey: chart.chartKey,
              queryContext,
              gradeSyncCoverage:
                await this.dashboardHomeworkAnalyticsRepository.countCurrentGradeSyncLinkCoverage(
                  { scope, hierarchy },
                ),
            });
          return presentDashboardAnalyticsChartData({
            queryContext,
            chart,
            gradesHomeworkData,
          });
        }
      }
    }

    if (isDashboardAnalyticsBehaviorReinforcementPackChartKey(chart.chartKey)) {
      const hierarchy = queryContext.hierarchy;

      switch (chart.chartKey) {
        case 'behavior.positive_negative_trend': {
          const behaviorReinforcementData =
            computeDashboardBehaviorReinforcementAnalyticsData({
              chartKey: chart.chartKey,
              queryContext,
              behaviorRecordTypes:
                await this.dashboardBehaviorAnalyticsRepository.aggregateApprovedRecordTypesByCivilDate(
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
            behaviorReinforcementData,
          });
        }

        case 'behavior.pending_review': {
          const behaviorReinforcementData =
            computeDashboardBehaviorReinforcementAnalyticsData({
              chartKey: chart.chartKey,
              queryContext,
              pendingBehaviorReview:
                await this.dashboardBehaviorAnalyticsRepository.countCurrentPendingReview(
                  { scope, hierarchy },
                ),
            });
          return presentDashboardAnalyticsChartData({
            queryContext,
            chart,
            behaviorReinforcementData,
          });
        }

        case 'behavior.records_by_category': {
          const behaviorReinforcementData =
            computeDashboardBehaviorReinforcementAnalyticsData({
              chartKey: chart.chartKey,
              queryContext,
              behaviorCategories:
                await this.dashboardBehaviorAnalyticsRepository.countApprovedRecordsByCategory(
                  { scope, window: queryContext, hierarchy },
                ),
            });
          return presentDashboardAnalyticsChartData({
            queryContext,
            chart,
            behaviorReinforcementData,
          });
        }

        case 'reinforcement.xp_activity_trend': {
          const behaviorReinforcementData =
            computeDashboardBehaviorReinforcementAnalyticsData({
              chartKey: chart.chartKey,
              queryContext,
              xpActivity:
                await this.dashboardReinforcementAnalyticsRepository.aggregateXpActivityByCivilDate(
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
            behaviorReinforcementData,
          });
        }

        case 'reinforcement.task_completion': {
          const behaviorReinforcementData =
            computeDashboardBehaviorReinforcementAnalyticsData({
              chartKey: chart.chartKey,
              queryContext,
              assignmentCompletion:
                await this.dashboardReinforcementAnalyticsRepository.countCurrentAssignmentCompletion(
                  {
                    scope,
                    generatedAt: queryContext.generatedAt,
                    hierarchy,
                  },
                ),
            });
          return presentDashboardAnalyticsChartData({
            queryContext,
            chart,
            behaviorReinforcementData,
          });
        }

        case 'reinforcement.reward_redemption_status': {
          const behaviorReinforcementData =
            computeDashboardBehaviorReinforcementAnalyticsData({
              chartKey: chart.chartKey,
              queryContext,
              rewardRedemptionFunnel:
                await this.dashboardReinforcementAnalyticsRepository.countRewardRedemptionFunnel(
                  { scope, window: queryContext, hierarchy },
                ),
            });
          return presentDashboardAnalyticsChartData({
            queryContext,
            chart,
            behaviorReinforcementData,
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
