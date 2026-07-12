import {
  DashboardCurriculumActivationAggregate,
  DashboardLessonPlanActivationAggregate,
  DashboardTeacherAllocationCoverageAggregate,
  DashboardTimetablePublicationStatusAggregate,
} from '../infrastructure/dashboard-academics-analytics.repository';
import { DashboardAnalyticsAcademicsPackChartKey } from './dashboard-analytics-catalog';
import {
  DashboardAnalyticsChartDataPoint,
  dashboardAnalyticsCategoryPoint,
} from './dashboard-analytics-coordinate';

export interface DashboardAcademicsAnalyticsData {
  series: readonly {
    key: string;
    label: string;
    points: readonly DashboardAnalyticsChartDataPoint[];
  }[];
  totals: Record<string, number>;
  summary: { value: number; label: string };
  empty: boolean;
}

export function computeDashboardAcademicsAnalyticsData(input: {
  chartKey: DashboardAnalyticsAcademicsPackChartKey;
  teacherAllocationCoverage?: DashboardTeacherAllocationCoverageAggregate;
  timetablePublicationStatus?: DashboardTimetablePublicationStatusAggregate;
  curriculumActivation?: DashboardCurriculumActivationAggregate;
  lessonPlanActivation?: DashboardLessonPlanActivationAggregate;
}): DashboardAcademicsAnalyticsData {
  switch (input.chartKey) {
    case 'academics.teacher_allocation_coverage':
      return twoCategoryData({
        first: {
          key: 'allocated',
          label: 'Allocated',
          value: input.teacherAllocationCoverage?.allocated ?? 0,
        },
        second: {
          key: 'missing',
          label: 'Missing',
          value: input.teacherAllocationCoverage?.missing ?? 0,
        },
        summaryLabel: 'Teacher allocation units',
      });
    case 'academics.timetable_publication_status':
      return twoCategoryData({
        first: {
          key: 'published',
          label: 'Published',
          value: input.timetablePublicationStatus?.published ?? 0,
        },
        second: {
          key: 'draft',
          label: 'Draft',
          value: input.timetablePublicationStatus?.draft ?? 0,
        },
        summaryLabel: 'Current timetable configurations',
      });
    case 'academics.curriculum_activation':
      return twoCategoryData({
        first: {
          key: 'active',
          label: 'Active',
          value: input.curriculumActivation?.active ?? 0,
        },
        second: {
          key: 'draft',
          label: 'Draft',
          value: input.curriculumActivation?.draft ?? 0,
        },
        summaryLabel: 'Current curricula',
      });
    case 'academics.lesson_plan_activation':
      return twoCategoryData({
        first: {
          key: 'active',
          label: 'Active',
          value: input.lessonPlanActivation?.active ?? 0,
        },
        second: {
          key: 'draft',
          label: 'Draft',
          value: input.lessonPlanActivation?.draft ?? 0,
        },
        summaryLabel: 'Current lesson plans',
      });
  }
}

function twoCategoryData(input: {
  first: { key: string; label: string; value: number };
  second: { key: string; label: string; value: number };
  summaryLabel: string;
}): DashboardAcademicsAnalyticsData {
  const total = input.first.value + input.second.value;

  return {
    series: [categorySeries(input.first), categorySeries(input.second)],
    totals: {
      [input.first.key]: input.first.value,
      [input.second.key]: input.second.value,
    },
    summary: { value: total, label: input.summaryLabel },
    empty: total === 0,
  };
}

function categorySeries(input: { key: string; label: string; value: number }) {
  return {
    key: input.key,
    label: input.label,
    points: [
      dashboardAnalyticsCategoryPoint(input.key, input.label, input.value),
    ],
  };
}
