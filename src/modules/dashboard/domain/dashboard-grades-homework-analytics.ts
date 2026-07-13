import {
  DashboardAssessmentStatusDistributionAggregate,
  DashboardGradebookCompletionAggregate,
} from '../infrastructure/dashboard-grades-analytics.repository';
import {
  DashboardHomeworkAssignmentStatusAggregate,
  DashboardHomeworkGradeSyncCoverageAggregate,
  DashboardHomeworkSubmissionReviewDailyAggregate,
} from '../infrastructure/dashboard-homework-analytics.repository';
import { buildDashboardAnalyticsBuckets } from './dashboard-analytics-buckets';
import { DashboardAnalyticsGradesHomeworkPackChartKey } from './dashboard-analytics-catalog';
import {
  DashboardAnalyticsChartDataPoint,
  dashboardAnalyticsCategoryPoint,
} from './dashboard-analytics-coordinate';
import { DashboardAnalyticsQueryContext } from './dashboard-analytics-query';

export interface DashboardGradesHomeworkAnalyticsData {
  series: readonly {
    key: string;
    label: string;
    points: readonly DashboardAnalyticsChartDataPoint[];
  }[];
  totals: Record<string, number>;
  summary: { value: number; label: string };
  empty: boolean;
}

export function computeDashboardGradesHomeworkAnalyticsData(input: {
  chartKey: DashboardAnalyticsGradesHomeworkPackChartKey;
  queryContext: DashboardAnalyticsQueryContext;
  assessmentStatus?: DashboardAssessmentStatusDistributionAggregate;
  gradebookCompletion?: DashboardGradebookCompletionAggregate;
  assignmentStatus?: DashboardHomeworkAssignmentStatusAggregate;
  submissionReviewEvents?: readonly DashboardHomeworkSubmissionReviewDailyAggregate[];
  gradeSyncCoverage?: DashboardHomeworkGradeSyncCoverageAggregate;
}): DashboardGradesHomeworkAnalyticsData {
  switch (input.chartKey) {
    case 'grades.assessment_status_distribution':
      return categoryData(
        [
          category('draft', 'Draft', input.assessmentStatus?.draft ?? 0),
          category(
            'published',
            'Published',
            input.assessmentStatus?.published ?? 0,
          ),
          category(
            'approved',
            'Approved',
            input.assessmentStatus?.approved ?? 0,
          ),
          category('locked', 'Locked', input.assessmentStatus?.locked ?? 0),
        ],
        'Current assessments',
      );
    case 'grades.gradebook_completion':
      return categoryData(
        [
          category(
            'complete',
            'Complete',
            input.gradebookCompletion?.complete ?? 0,
          ),
          category(
            'missing',
            'Missing',
            input.gradebookCompletion?.missing ?? 0,
          ),
        ],
        'Expected gradebook cells',
      );
    case 'homework.assignment_status_distribution':
      return categoryData(
        [
          category('draft', 'Draft', input.assignmentStatus?.draft ?? 0),
          category(
            'published',
            'Published',
            input.assignmentStatus?.published ?? 0,
          ),
          category('closed', 'Closed', input.assignmentStatus?.closed ?? 0),
          category(
            'cancelled',
            'Cancelled',
            input.assignmentStatus?.cancelled ?? 0,
          ),
        ],
        'Current homework assignments',
      );
    case 'homework.submission_review_trend':
      return submissionReviewTrend(
        input.queryContext,
        input.submissionReviewEvents ?? [],
      );
    case 'homework.grade_sync_coverage':
      return categoryData(
        [
          category('linked', 'Linked', input.gradeSyncCoverage?.linked ?? 0),
          category('pending', 'Pending', input.gradeSyncCoverage?.pending ?? 0),
        ],
        'Graded homework assignments',
      );
  }
}

function submissionReviewTrend(
  context: DashboardAnalyticsQueryContext,
  rows: readonly DashboardHomeworkSubmissionReviewDailyAggregate[],
): DashboardGradesHomeworkAnalyticsData {
  const buckets = buildDashboardAnalyticsBuckets({
    granularity: context.granularity,
    startCivilDate: context.startCivilDate,
    endCivilDate: context.endCivilDate,
  });
  const counts = new Map(
    buckets.map((bucket) => [bucket.key, { submitted: 0, reviewed: 0 }]),
  );

  for (const row of rows) {
    const bucket = buckets.find(
      (candidate) =>
        row.civilDate >= candidate.startDate &&
        row.civilDate <= candidate.endDate,
    );
    if (!bucket) continue;
    const current = counts.get(bucket.key)!;
    current.submitted += row.submitted;
    current.reviewed += row.reviewed;
  }

  const submittedTotal = [...counts.values()].reduce(
    (total, value) => total + value.submitted,
    0,
  );
  const reviewedTotal = [...counts.values()].reduce(
    (total, value) => total + value.reviewed,
    0,
  );

  return {
    series: [
      {
        key: 'submitted',
        label: 'Submitted',
        points: buckets.map((bucket) =>
          bucket.point(counts.get(bucket.key)!.submitted),
        ),
      },
      {
        key: 'reviewed',
        label: 'Reviewed',
        points: buckets.map((bucket) =>
          bucket.point(counts.get(bucket.key)!.reviewed),
        ),
      },
    ],
    totals: { submitted: submittedTotal, reviewed: reviewedTotal },
    summary: {
      value: submittedTotal + reviewedTotal,
      label: 'Submission review events',
    },
    empty: submittedTotal + reviewedTotal === 0,
  };
}

function category(key: string, label: string, value: number) {
  return { key, label, value };
}

function categoryData(
  categories: readonly { key: string; label: string; value: number }[],
  summaryLabel: string,
): DashboardGradesHomeworkAnalyticsData {
  const total = categories.reduce((sum, item) => sum + item.value, 0);
  return {
    series: categories.map((item) => ({
      key: item.key,
      label: item.label,
      points: [
        dashboardAnalyticsCategoryPoint(item.key, item.label, item.value),
      ],
    })),
    totals: Object.fromEntries(
      categories.map((item) => [item.key, item.value]),
    ),
    summary: { value: total, label: summaryLabel },
    empty: total === 0,
  };
}
