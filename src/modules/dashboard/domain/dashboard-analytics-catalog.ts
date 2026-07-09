export const DASHBOARD_ANALYTICS_PERMISSION = 'dashboard.analytics.view';

export const DASHBOARD_ANALYTICS_SOURCES = [
  'admissions',
  'students',
  'academics',
  'attendance',
  'grades',
  'homework',
  'behavior',
  'reinforcement',
  'communication',
  'settings',
] as const;

export const DASHBOARD_ANALYTICS_CHART_TYPES = [
  'line',
  'bar',
  'stacked-bar',
  'area',
  'donut',
  'pie',
  'funnel',
  'heatmap',
  'radial-progress',
  'table',
  'timeline',
] as const;

export const DASHBOARD_ANALYTICS_RANGES = [
  '7d',
  '30d',
  '90d',
  'term',
  'academic_year',
  'custom',
] as const;

export const DASHBOARD_ANALYTICS_GRANULARITIES = [
  'day',
  'week',
  'month',
] as const;

export const DASHBOARD_ANALYTICS_STATUSES = [
  'available',
  'planned',
  'deferred',
] as const;

export const DASHBOARD_ANALYTICS_FILTER_KEYS = [
  'range',
  'granularity',
  'dateFrom',
  'dateTo',
  'academicYearId',
  'termId',
  'gradeId',
  'sectionId',
  'classroomId',
  'source',
  'type',
  'status',
] as const;

export const DASHBOARD_ANALYTICS_DEFAULT_CHART_LIMIT = 50;
export const DASHBOARD_ANALYTICS_MAX_CHART_LIMIT = 100;

export type DashboardAnalyticsSource =
  (typeof DASHBOARD_ANALYTICS_SOURCES)[number];
export type DashboardAnalyticsChartType =
  (typeof DASHBOARD_ANALYTICS_CHART_TYPES)[number];
export type DashboardAnalyticsRange =
  (typeof DASHBOARD_ANALYTICS_RANGES)[number];
export type DashboardAnalyticsGranularity =
  (typeof DASHBOARD_ANALYTICS_GRANULARITIES)[number];
export type DashboardAnalyticsStatus =
  (typeof DASHBOARD_ANALYTICS_STATUSES)[number];
export type DashboardAnalyticsFilterKey =
  (typeof DASHBOARD_ANALYTICS_FILTER_KEYS)[number];
export type DashboardAnalyticsMetricValueType =
  | 'count'
  | 'percentage'
  | 'ratio'
  | 'duration'
  | 'currency'
  | 'boolean'
  | 'score';
export type DashboardAnalyticsMetricAggregation =
  | 'count'
  | 'sum'
  | 'average'
  | 'rate'
  | 'ratio'
  | 'distribution'
  | 'snapshot'
  | 'trend';
export type DashboardAnalyticsTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'critical';
export type DashboardAnalyticsDataAvailability =
  | 'definition_only'
  | 'computed_snapshot';
export type DashboardAnalyticsChartEmptyStateReason =
  | 'not_implemented'
  | 'no_data';

export interface DashboardAnalyticsSourceDefinition {
  source: DashboardAnalyticsSource;
  label: string;
  status: DashboardAnalyticsStatus;
  description: string;
}

export interface DashboardAnalyticsFilterDefinition {
  key: DashboardAnalyticsFilterKey;
  type: 'enum' | 'date' | 'id';
  values?: readonly string[];
  description: string;
  requiredWhen?: string;
  validation?: string;
}

export interface DashboardAnalyticsMetricDefinition {
  metricKey: string;
  source: DashboardAnalyticsSource;
  label: string;
  description: string;
  valueType: DashboardAnalyticsMetricValueType;
  unit: string | null;
  aggregation: DashboardAnalyticsMetricAggregation;
  status: DashboardAnalyticsStatus;
  sourceModels: readonly string[];
  noLeakNotes: string;
}

export interface DashboardAnalyticsKpiDefinition {
  kpiKey: string;
  source: DashboardAnalyticsSource;
  label: string;
  description: string;
  metricKeys: readonly string[];
  status: DashboardAnalyticsStatus;
  defaultTone: DashboardAnalyticsTone;
  actionTarget: string;
}

export interface DashboardAnalyticsSeriesDefinition {
  key: string;
  label: string;
}

export interface DashboardAnalyticsChartEmptyState {
  reason: DashboardAnalyticsChartEmptyStateReason;
  message: string;
}

export interface DashboardAnalyticsChartMeta {
  dataAvailability: DashboardAnalyticsDataAvailability;
}

export interface DashboardAnalyticsChartDefinition {
  chartKey: string;
  source: DashboardAnalyticsSource;
  title: string;
  description: string;
  type: DashboardAnalyticsChartType;
  status: DashboardAnalyticsStatus;
  defaultRange: DashboardAnalyticsRange;
  supportedRanges: readonly DashboardAnalyticsRange[];
  supportedGranularities: readonly DashboardAnalyticsGranularity[];
  requiredPermission: typeof DASHBOARD_ANALYTICS_PERMISSION;
  endpoint: string;
  series: readonly DashboardAnalyticsSeriesDefinition[];
  filters: readonly DashboardAnalyticsFilterKey[];
  emptyState: DashboardAnalyticsChartEmptyState;
  meta: DashboardAnalyticsChartMeta;
}

export interface DashboardAnalyticsCatalogDefinition {
  version: 'v1';
  sources: readonly DashboardAnalyticsSourceDefinition[];
  supportedChartTypes: readonly DashboardAnalyticsChartType[];
  supportedRanges: readonly DashboardAnalyticsRange[];
  supportedGranularities: readonly DashboardAnalyticsGranularity[];
  filters: readonly DashboardAnalyticsFilterDefinition[];
  metrics: readonly DashboardAnalyticsMetricDefinition[];
  kpis: readonly DashboardAnalyticsKpiDefinition[];
  charts: readonly DashboardAnalyticsChartDefinition[];
}

const STANDARD_OPERATIONAL_FILTERS: readonly DashboardAnalyticsFilterKey[] = [
  'range',
  'granularity',
  'dateFrom',
  'dateTo',
  'academicYearId',
  'termId',
  'gradeId',
  'sectionId',
  'classroomId',
];

const REVIEW_FILTERS: readonly DashboardAnalyticsFilterKey[] = [
  'range',
  'dateFrom',
  'dateTo',
  'academicYearId',
  'termId',
  'gradeId',
  'sectionId',
  'classroomId',
];

export const DASHBOARD_ANALYTICS_COMPUTED_SNAPSHOT_CHART_KEYS = [
  'attendance.pending_sessions',
  'grades.pending_submission_reviews',
  'grades.pending_answer_reviews',
  'communication.moderation_queue',
  'settings.email_connection_readiness',
  'settings.login_identity_readiness',
] as const;

export type DashboardAnalyticsComputedSnapshotChartKey =
  (typeof DASHBOARD_ANALYTICS_COMPUTED_SNAPSHOT_CHART_KEYS)[number];

export const DASHBOARD_ANALYTICS_SOURCES_CATALOG: readonly DashboardAnalyticsSourceDefinition[] =
  [
    {
      source: 'admissions',
      label: 'Admissions',
      status: 'available',
      description: 'Admissions funnel and application workload analytics.',
    },
    {
      source: 'students',
      label: 'Students',
      status: 'available',
      description: 'Student enrollment and guardian coverage analytics.',
    },
    {
      source: 'academics',
      label: 'Academics',
      status: 'available',
      description: 'Academic structure, allocation, timetable, and curriculum readiness analytics.',
    },
    {
      source: 'attendance',
      label: 'Attendance',
      status: 'available',
      description: 'Attendance operational analytics and future trend definitions.',
    },
    {
      source: 'grades',
      label: 'Grades',
      status: 'available',
      description: 'Assessment, submission, review, and gradebook analytics.',
    },
    {
      source: 'homework',
      label: 'Homework',
      status: 'available',
      description: 'Homework assignment, submission review, and grade-sync analytics.',
    },
    {
      source: 'behavior',
      label: 'Behavior',
      status: 'available',
      description: 'Behavior record review and category analytics.',
    },
    {
      source: 'reinforcement',
      label: 'Reinforcement',
      status: 'available',
      description: 'XP, tasks, reviews, and reward analytics.',
    },
    {
      source: 'communication',
      label: 'Communication',
      status: 'available',
      description: 'Announcements, messaging, and moderation analytics.',
    },
    {
      source: 'settings',
      label: 'Settings',
      status: 'available',
      description: 'School configuration and readiness analytics.',
    },
  ];

export const DASHBOARD_ANALYTICS_FILTERS: readonly DashboardAnalyticsFilterDefinition[] =
  [
    {
      key: 'range',
      type: 'enum',
      values: DASHBOARD_ANALYTICS_RANGES,
      description: 'Future chart data range selector.',
    },
    {
      key: 'granularity',
      type: 'enum',
      values: DASHBOARD_ANALYTICS_GRANULARITIES,
      description: 'Future chart data time grouping selector.',
    },
    {
      key: 'dateFrom',
      type: 'date',
      description: 'Future custom range start date.',
      requiredWhen: 'range=custom',
      validation: 'ISO date string',
    },
    {
      key: 'dateTo',
      type: 'date',
      description: 'Future custom range end date.',
      requiredWhen: 'range=custom',
      validation: 'ISO date string',
    },
    {
      key: 'academicYearId',
      type: 'id',
      description: 'Future same-school academic year filter.',
      validation: 'same-school validated in future data endpoints',
    },
    {
      key: 'termId',
      type: 'id',
      description: 'Future same-school term filter.',
      validation: 'same-school validated in future data endpoints',
    },
    {
      key: 'gradeId',
      type: 'id',
      description: 'Future same-school grade filter.',
      validation: 'same-school validated in future data endpoints',
    },
    {
      key: 'sectionId',
      type: 'id',
      description: 'Future same-school section filter.',
      validation: 'same-school validated in future data endpoints',
    },
    {
      key: 'classroomId',
      type: 'id',
      description: 'Future same-school classroom filter.',
      validation: 'same-school validated in future data endpoints',
    },
    {
      key: 'source',
      type: 'enum',
      values: DASHBOARD_ANALYTICS_SOURCES,
      description: 'Catalog chart source filter.',
    },
    {
      key: 'type',
      type: 'enum',
      values: DASHBOARD_ANALYTICS_CHART_TYPES,
      description: 'Catalog chart type filter.',
    },
    {
      key: 'status',
      type: 'enum',
      values: DASHBOARD_ANALYTICS_STATUSES,
      description: 'Catalog implementation status filter.',
    },
  ];

export const DASHBOARD_ANALYTICS_METRICS: readonly DashboardAnalyticsMetricDefinition[] =
  [
    metric('admissions.open_applications', 'admissions', 'Open applications', 'Admission applications still in an open operational state.', 'count', null, 'count', ['Application']),
    metric('admissions.submitted_applications', 'admissions', 'Submitted applications', 'Admission applications submitted and waiting for school processing.', 'count', null, 'count', ['Application']),
    metric('admissions.accepted_applications', 'admissions', 'Accepted applications', 'Admission applications with accepted decisions.', 'count', null, 'count', ['Application', 'AdmissionDecision']),
    metric('students.active_students', 'students', 'Active students', 'Currently active student records in the school.', 'count', null, 'count', ['Student']),
    metric('students.active_enrollments', 'students', 'Active enrollments', 'Current active student enrollments.', 'count', null, 'count', ['Enrollment']),
    metric('attendance.pending_sessions_today', 'attendance', "Today's pending attendance sessions", 'Attendance sessions for today that still require submission.', 'count', null, 'count', ['AttendanceSession']),
    metric('attendance.absent_entries_today', 'attendance', "Today's absent entries", 'Attendance entries marked absent today.', 'count', null, 'count', ['AttendanceEntry']),
    metric('attendance.late_entries_today', 'attendance', "Today's late entries", 'Attendance entries marked late today.', 'count', null, 'count', ['AttendanceEntry']),
    metric('grades.pending_submissions', 'grades', 'Pending grade submissions', 'Question-based grade submissions waiting for review.', 'count', null, 'count', ['GradeSubmission']),
    metric('grades.pending_answer_reviews', 'grades', 'Pending answer reviews', 'Grade submission answers waiting for review.', 'count', null, 'count', ['GradeSubmissionAnswer']),
    metric('homework.submissions_waiting_review', 'homework', 'Homework submissions waiting review', 'Homework submissions submitted and awaiting review.', 'count', null, 'count', ['HomeworkSubmission']),
    metric('behavior.pending_review_records', 'behavior', 'Behavior records pending review', 'Submitted behavior records waiting for review.', 'count', null, 'count', ['BehaviorRecord']),
    metric('reinforcement.pending_reviews', 'reinforcement', 'Reinforcement reviews pending', 'Reinforcement submissions waiting for approval or rejection.', 'count', null, 'count', ['ReinforcementSubmission']),
    metric('communication.pending_moderation_reports', 'communication', 'Pending moderation reports', 'Communication reports waiting for moderation.', 'count', null, 'count', ['CommunicationMessageReport']),
    metric('settings.email_connection_active', 'settings', 'Email connection active', 'Whether the school email connection is active or verified.', 'boolean', null, 'snapshot', ['SchoolEmailConnection']),
    metric('settings.login_identity_configured', 'settings', 'Login identity configured', 'Whether school login identity settings are configured.', 'boolean', null, 'snapshot', ['SchoolLoginSettings']),
  ];

export const DASHBOARD_ANALYTICS_KPIS: readonly DashboardAnalyticsKpiDefinition[] =
  [
    kpi('school.operational_health', 'settings', 'School operational health', 'High-level operational health synthesized from dashboard readiness signals.', ['students.active_students', 'attendance.pending_sessions_today', 'settings.email_connection_active', 'settings.login_identity_configured'], 'warning', '/dashboard/command-center'),
    kpi('admissions.pending_work', 'admissions', 'Admissions pending work', 'Admissions workload requiring school follow-up.', ['admissions.open_applications', 'admissions.submitted_applications'], 'warning', '/admissions/applications'),
    kpi('students.enrollment_health', 'students', 'Enrollment health', 'Student and enrollment readiness indicator.', ['students.active_students', 'students.active_enrollments'], 'info', '/students'),
    kpi('academics.readiness', 'academics', 'Academics readiness', 'Academic structure, allocation, curriculum, and timetable readiness.', [], 'warning', '/academics/overview'),
    kpi('attendance.today_readiness', 'attendance', "Today's attendance readiness", 'Measures whether today attendance sessions are submitted.', ['attendance.pending_sessions_today'], 'warning', '/attendance/roll-call'),
    kpi('grades.review_backlog', 'grades', 'Grades review backlog', 'Grade submissions and answers waiting for review.', ['grades.pending_submissions', 'grades.pending_answer_reviews'], 'warning', '/grades/submissions'),
    kpi('homework.review_backlog', 'homework', 'Homework review backlog', 'Homework submissions waiting for teacher review.', ['homework.submissions_waiting_review'], 'warning', '/homework/submissions'),
    kpi('behavior.review_backlog', 'behavior', 'Behavior review backlog', 'Behavior records waiting for review.', ['behavior.pending_review_records'], 'warning', '/behavior/review'),
    kpi('reinforcement.review_backlog', 'reinforcement', 'Reinforcement review backlog', 'Reinforcement submissions waiting for approval.', ['reinforcement.pending_reviews'], 'warning', '/reinforcement/reviews'),
    kpi('communication.safety_queue', 'communication', 'Communication safety queue', 'Moderation workload in communication safety queues.', ['communication.pending_moderation_reports'], 'critical', '/communication/moderation'),
    kpi('settings.configuration_readiness', 'settings', 'Configuration readiness', 'Core operational settings readiness.', ['settings.email_connection_active', 'settings.login_identity_configured'], 'warning', '/settings'),
  ];

export const DASHBOARD_ANALYTICS_CHARTS: readonly DashboardAnalyticsChartDefinition[] =
  [
    chart('admissions.funnel', 'admissions', 'Admissions funnel', 'Applications moving through the admissions funnel.', 'funnel', [
      series('lead', 'Leads'),
      series('submitted', 'Submitted'),
      series('under_review', 'Under review'),
      series('accepted', 'Accepted'),
    ]),
    chart('admissions.applications_by_status', 'admissions', 'Applications by status', 'Application counts grouped by admissions status.', 'donut', [
      series('submitted', 'Submitted'),
      series('under_review', 'Under review'),
      series('accepted', 'Accepted'),
      series('rejected', 'Rejected'),
      series('waitlisted', 'Waitlisted'),
    ]),
    chart('admissions.applications_over_time', 'admissions', 'Applications over time', 'Submitted admissions applications over time.', 'line', [
      series('submitted', 'Submitted'),
      series('accepted', 'Accepted'),
    ]),
    chart('students.enrollment_growth', 'students', 'Enrollment growth', 'Active enrollment growth over time.', 'area', [
      series('active_enrollments', 'Active enrollments'),
    ]),
    chart('students.withdrawal_trend', 'students', 'Withdrawal trend', 'Student withdrawal count trend.', 'line', [
      series('withdrawals', 'Withdrawals'),
    ]),
    chart('students.guardian_coverage', 'students', 'Guardian coverage', 'Students with guardian coverage versus missing coverage.', 'donut', [
      series('covered', 'Covered'),
      series('missing', 'Missing'),
    ]),
    chart('attendance.daily_trend', 'attendance', 'Daily attendance trend', 'Daily attendance counts by present, absent, and late status.', 'line', [
      series('present', 'Present'),
      series('absent', 'Absent'),
      series('late', 'Late'),
    ]),
    chart('attendance.status_distribution', 'attendance', 'Attendance status distribution', 'Attendance entry distribution by status.', 'stacked-bar', [
      series('present', 'Present'),
      series('absent', 'Absent'),
      series('late', 'Late'),
      series('excused', 'Excused'),
    ]),
    chart('attendance.absence_rate', 'attendance', 'Absence rate', 'Absence rate over the selected range.', 'line', [
      series('absence_rate', 'Absence rate'),
    ]),
    chart('attendance.late_rate', 'attendance', 'Late rate', 'Late arrival rate over the selected range.', 'line', [
      series('late_rate', 'Late rate'),
    ]),
    chart('attendance.pending_sessions', 'attendance', 'Pending attendance sessions', 'Attendance sessions waiting for submission.', 'bar', [
      series('pending_sessions', 'Pending sessions'),
    ], STANDARD_OPERATIONAL_FILTERS, computedSnapshotOptions('No pending attendance sessions found for this school.')),
    chart('attendance.excuse_status', 'attendance', 'Excuse status', 'Attendance excuse requests by review status.', 'pie', [
      series('pending', 'Pending'),
      series('approved', 'Approved'),
      series('rejected', 'Rejected'),
    ]),
    chart('academics.structure_readiness', 'academics', 'Structure readiness', 'Academic structure setup readiness.', 'radial-progress', [
      series('readiness', 'Readiness'),
    ]),
    chart('academics.subject_allocation_coverage', 'academics', 'Subject allocation coverage', 'Subject allocation coverage by academic scope.', 'bar', [
      series('allocated', 'Allocated'),
      series('missing', 'Missing'),
    ]),
    chart('academics.teacher_allocation_coverage', 'academics', 'Teacher allocation coverage', 'Teacher allocation coverage by academic scope.', 'bar', [
      series('allocated', 'Allocated'),
      series('missing', 'Missing'),
    ]),
    chart('academics.timetable_publication_status', 'academics', 'Timetable publication status', 'Timetable publication readiness by term.', 'table', [
      series('published', 'Published'),
      series('draft', 'Draft'),
    ]),
    chart('academics.curriculum_activation', 'academics', 'Curriculum activation', 'Curriculum activation coverage.', 'radial-progress', [
      series('active', 'Active'),
      series('draft', 'Draft'),
    ]),
    chart('academics.lesson_plan_activation', 'academics', 'Lesson plan activation', 'Lesson plan activation coverage.', 'radial-progress', [
      series('active', 'Active'),
      series('draft', 'Draft'),
    ]),
    chart('grades.assessment_status_distribution', 'grades', 'Assessment status distribution', 'Assessments grouped by workflow status.', 'donut', [
      series('draft', 'Draft'),
      series('published', 'Published'),
      series('approved', 'Approved'),
      series('locked', 'Locked'),
    ]),
    chart('grades.pending_submission_reviews', 'grades', 'Pending submission reviews', 'Grade submissions waiting for review.', 'bar', [
      series('pending_submissions', 'Pending submissions'),
    ], REVIEW_FILTERS, computedSnapshotOptions('No pending grade submissions found for this school.')),
    chart('grades.pending_answer_reviews', 'grades', 'Pending answer reviews', 'Grade submission answers waiting for review.', 'bar', [
      series('pending_answers', 'Pending answers'),
    ], REVIEW_FILTERS, computedSnapshotOptions('No pending grade answers found for this school.')),
    chart('grades.gradebook_completion', 'grades', 'Gradebook completion', 'Gradebook completion coverage.', 'radial-progress', [
      series('complete', 'Complete'),
      series('missing', 'Missing'),
    ]),
    chart('homework.assignment_status_distribution', 'homework', 'Assignment status distribution', 'Homework assignments grouped by status.', 'donut', [
      series('draft', 'Draft'),
      series('published', 'Published'),
      series('closed', 'Closed'),
      series('cancelled', 'Cancelled'),
    ]),
    chart('homework.submission_review_trend', 'homework', 'Submission review trend', 'Homework submission review workload over time.', 'line', [
      series('submitted', 'Submitted'),
      series('reviewed', 'Reviewed'),
    ], REVIEW_FILTERS),
    chart('homework.grade_sync_coverage', 'homework', 'Grade sync coverage', 'Homework assignments linked to grade sync versus pending.', 'donut', [
      series('linked', 'Linked'),
      series('pending', 'Pending'),
    ]),
    chart('behavior.positive_negative_trend', 'behavior', 'Positive/negative behavior trend', 'Positive and negative behavior records over time.', 'stacked-bar', [
      series('positive', 'Positive'),
      series('negative', 'Negative'),
    ]),
    chart('behavior.pending_review', 'behavior', 'Behavior pending review', 'Behavior records waiting for review.', 'bar', [
      series('pending_review', 'Pending review'),
    ], REVIEW_FILTERS),
    chart('behavior.records_by_category', 'behavior', 'Behavior records by category', 'Behavior record counts grouped by category.', 'bar', [
      series('records', 'Records'),
    ]),
    chart('reinforcement.xp_activity_trend', 'reinforcement', 'XP activity trend', 'XP activity over time.', 'area', [
      series('xp', 'XP'),
    ]),
    chart('reinforcement.task_completion', 'reinforcement', 'Task completion', 'Reinforcement task completion status.', 'bar', [
      series('completed', 'Completed'),
      series('pending', 'Pending'),
      series('overdue', 'Overdue'),
    ]),
    chart('reinforcement.reward_redemption_status', 'reinforcement', 'Reward redemption status', 'Reward redemptions grouped by status.', 'funnel', [
      series('requested', 'Requested'),
      series('approved', 'Approved'),
      series('fulfilled', 'Fulfilled'),
    ]),
    chart('communication.message_volume', 'communication', 'Message volume', 'Communication message volume over time.', 'line', [
      series('messages', 'Messages'),
    ]),
    chart('communication.announcement_status', 'communication', 'Announcement status', 'Announcements grouped by status.', 'donut', [
      series('draft', 'Draft'),
      series('published', 'Published'),
      series('archived', 'Archived'),
    ]),
    chart('communication.moderation_queue', 'communication', 'Moderation queue', 'Communication reports waiting for moderation.', 'table', [
      series('pending_reports', 'Pending reports'),
    ], REVIEW_FILTERS, computedSnapshotOptions('No pending communication moderation reports found for this school.')),
    chart('settings.email_connection_readiness', 'settings', 'Email connection readiness', 'School email connection readiness.', 'radial-progress', [
      series('ready', 'Ready'),
    ], ['status'], computedSnapshotOptions('School email connection readiness can be computed from current settings.')),
    chart('settings.login_identity_readiness', 'settings', 'Login identity readiness', 'School login identity readiness.', 'radial-progress', [
      series('configured', 'Configured'),
    ], ['status'], computedSnapshotOptions('School login identity readiness can be computed from current settings.')),
    chart('settings.notification_readiness', 'settings', 'Notification readiness', 'Notification channel readiness.', 'radial-progress', [
      series('ready', 'Ready'),
    ], ['status']),
  ];

export const DASHBOARD_ANALYTICS_CATALOG: DashboardAnalyticsCatalogDefinition = {
  version: 'v1',
  sources: DASHBOARD_ANALYTICS_SOURCES_CATALOG,
  supportedChartTypes: DASHBOARD_ANALYTICS_CHART_TYPES,
  supportedRanges: DASHBOARD_ANALYTICS_RANGES,
  supportedGranularities: DASHBOARD_ANALYTICS_GRANULARITIES,
  filters: DASHBOARD_ANALYTICS_FILTERS,
  metrics: DASHBOARD_ANALYTICS_METRICS,
  kpis: DASHBOARD_ANALYTICS_KPIS,
  charts: DASHBOARD_ANALYTICS_CHARTS,
};

export const DASHBOARD_ANALYTICS_CHART_KEYS = DASHBOARD_ANALYTICS_CHARTS.map(
  (chartDefinition) => chartDefinition.chartKey,
);

export function findDashboardAnalyticsChartDefinition(
  chartKey: string,
): DashboardAnalyticsChartDefinition | undefined {
  return DASHBOARD_ANALYTICS_CHARTS.find(
    (definition) => definition.chartKey === chartKey,
  );
}

function metric(
  metricKey: string,
  source: DashboardAnalyticsSource,
  label: string,
  description: string,
  valueType: DashboardAnalyticsMetricValueType,
  unit: string | null,
  aggregation: DashboardAnalyticsMetricAggregation,
  sourceModels: readonly string[],
): DashboardAnalyticsMetricDefinition {
  return {
    metricKey,
    source,
    label,
    description,
    valueType,
    unit,
    aggregation,
    status: 'planned',
    sourceModels,
    noLeakNotes:
      'Aggregate definition only; catalog excludes tenant identifiers, actor identifiers, student identities, and source row payloads.',
  };
}

function kpi(
  kpiKey: string,
  source: DashboardAnalyticsSource,
  label: string,
  description: string,
  metricKeys: readonly string[],
  defaultTone: DashboardAnalyticsTone,
  actionTarget: string,
): DashboardAnalyticsKpiDefinition {
  return {
    kpiKey,
    source,
    label,
    description,
    metricKeys,
    status: 'planned',
    defaultTone,
    actionTarget,
  };
}

function chart(
  chartKey: string,
  source: DashboardAnalyticsSource,
  title: string,
  description: string,
  type: DashboardAnalyticsChartType,
  seriesDefinitions: readonly DashboardAnalyticsSeriesDefinition[],
  filters: readonly DashboardAnalyticsFilterKey[] = STANDARD_OPERATIONAL_FILTERS,
  options: {
    status?: DashboardAnalyticsStatus;
    dataAvailability?: DashboardAnalyticsDataAvailability;
    emptyState?: DashboardAnalyticsChartEmptyState;
  } = {},
): DashboardAnalyticsChartDefinition {
  return {
    chartKey,
    source,
    title,
    description,
    type,
    status: options.status ?? 'planned',
    defaultRange: '30d',
    supportedRanges: DASHBOARD_ANALYTICS_RANGES,
    supportedGranularities: DASHBOARD_ANALYTICS_GRANULARITIES,
    requiredPermission: DASHBOARD_ANALYTICS_PERMISSION,
    endpoint: `/dashboard/analytics/charts/${chartKey}`,
    series: seriesDefinitions,
    filters,
    emptyState: options.emptyState ?? {
      reason: 'not_implemented',
      message: 'Chart data will be implemented in a future analytics pack.',
    },
    meta: {
      dataAvailability: options.dataAvailability ?? 'definition_only',
    },
  };
}

function computedSnapshotOptions(
  emptyStateMessage: string,
): {
  status: 'available';
  dataAvailability: 'computed_snapshot';
  emptyState: DashboardAnalyticsChartEmptyState;
} {
  return {
    status: 'available',
    dataAvailability: 'computed_snapshot',
    emptyState: {
      reason: 'no_data',
      message: emptyStateMessage,
    },
  };
}

function series(key: string, label: string): DashboardAnalyticsSeriesDefinition {
  return { key, label };
}
