import {
  DASHBOARD_ANALYTICS_ATTENDANCE_PACK_CHART_KEYS,
  DASHBOARD_ANALYTICS_ACADEMICS_PACK_CHART_KEYS,
  DASHBOARD_ANALYTICS_ADMISSIONS_STUDENTS_PACK_CHART_KEYS,
  DASHBOARD_ANALYTICS_COMPUTED_SNAPSHOT_CHART_KEYS,
  DASHBOARD_ANALYTICS_GRADES_HOMEWORK_PACK_CHART_KEYS,
  DASHBOARD_ANALYTICS_BEHAVIOR_REINFORCEMENT_PACK_CHART_KEYS,
  DashboardAnalyticsAcademicsPackChartKey,
  DashboardAnalyticsAdmissionsStudentsPackChartKey,
  DashboardAnalyticsAttendancePackChartKey,
  DashboardAnalyticsComputedSnapshotChartKey,
  DashboardAnalyticsGradesHomeworkPackChartKey,
  DashboardAnalyticsBehaviorReinforcementPackChartKey,
} from './dashboard-analytics-catalog';

export const DASHBOARD_ANALYTICS_OPERATIONAL_SNAPSHOT_PACK =
  'operational_snapshot_v1' as const;

export type DashboardAnalyticsOperationalSnapshotPack =
  typeof DASHBOARD_ANALYTICS_OPERATIONAL_SNAPSHOT_PACK;

export const DASHBOARD_ANALYTICS_ATTENDANCE_PACK = 'attendance_v1' as const;

export type DashboardAnalyticsAttendancePack =
  typeof DASHBOARD_ANALYTICS_ATTENDANCE_PACK;

export const DASHBOARD_ANALYTICS_ADMISSIONS_STUDENTS_PACK =
  'admissions_students_v1' as const;

export type DashboardAnalyticsAdmissionsStudentsPack =
  typeof DASHBOARD_ANALYTICS_ADMISSIONS_STUDENTS_PACK;

export const DASHBOARD_ANALYTICS_ACADEMICS_PACK = 'academics_v1' as const;

export type DashboardAnalyticsAcademicsPack =
  typeof DASHBOARD_ANALYTICS_ACADEMICS_PACK;

export const DASHBOARD_ANALYTICS_GRADES_HOMEWORK_PACK =
  'grades_homework_v1' as const;

export type DashboardAnalyticsGradesHomeworkPack =
  typeof DASHBOARD_ANALYTICS_GRADES_HOMEWORK_PACK;

export const DASHBOARD_ANALYTICS_BEHAVIOR_REINFORCEMENT_PACK =
  'behavior_reinforcement_v1' as const;

export type DashboardAnalyticsBehaviorReinforcementPack =
  typeof DASHBOARD_ANALYTICS_BEHAVIOR_REINFORCEMENT_PACK;

export type DashboardAnalyticsDataComputation =
  | 'dashboard_summary_snapshot'
  | 'dashboard_alert_readiness_snapshot'
  | 'attendance_observation_daily_trend'
  | 'attendance_observation_status_distribution'
  | 'attendance_observation_absence_rate'
  | 'attendance_observation_late_rate'
  | 'attendance_excuse_status_distribution'
  | 'admissions_current_application_status_distribution'
  | 'admissions_application_submission_acceptance_events'
  | 'students_point_in_time_active_enrollment_stock'
  | 'students_withdrawal_events'
  | 'students_current_guardian_coverage'
  | 'academics_teacher_allocation_coverage'
  | 'academics_current_timetable_publication_status'
  | 'academics_current_curriculum_activation_status'
  | 'academics_current_lesson_plan_activation_status'
  | 'grades_current_assessment_status_distribution'
  | 'grades_current_gradebook_completion'
  | 'homework_current_assignment_status_distribution'
  | 'homework_submission_review_trend'
  | 'homework_current_grade_sync_link_coverage'
  | 'behavior_approved_positive_negative_trend'
  | 'behavior_current_pending_review'
  | 'behavior_approved_records_by_category'
  | 'reinforcement_xp_activity_trend'
  | 'reinforcement_current_assignment_completion'
  | 'reinforcement_reward_redemption_funnel';

export function isDashboardAnalyticsComputedSnapshotChartKey(
  chartKey: string,
): chartKey is DashboardAnalyticsComputedSnapshotChartKey {
  return (
    DASHBOARD_ANALYTICS_COMPUTED_SNAPSHOT_CHART_KEYS as readonly string[]
  ).includes(chartKey);
}

export function isDashboardAnalyticsAttendancePackChartKey(
  chartKey: string,
): chartKey is DashboardAnalyticsAttendancePackChartKey {
  return (
    DASHBOARD_ANALYTICS_ATTENDANCE_PACK_CHART_KEYS as readonly string[]
  ).includes(chartKey);
}

export function isDashboardAnalyticsAdmissionsStudentsPackChartKey(
  chartKey: string,
): chartKey is DashboardAnalyticsAdmissionsStudentsPackChartKey {
  return (
    DASHBOARD_ANALYTICS_ADMISSIONS_STUDENTS_PACK_CHART_KEYS as readonly string[]
  ).includes(chartKey);
}

export function isDashboardAnalyticsAcademicsPackChartKey(
  chartKey: string,
): chartKey is DashboardAnalyticsAcademicsPackChartKey {
  return (
    DASHBOARD_ANALYTICS_ACADEMICS_PACK_CHART_KEYS as readonly string[]
  ).includes(chartKey);
}

export function isDashboardAnalyticsGradesHomeworkPackChartKey(
  chartKey: string,
): chartKey is DashboardAnalyticsGradesHomeworkPackChartKey {
  return (
    DASHBOARD_ANALYTICS_GRADES_HOMEWORK_PACK_CHART_KEYS as readonly string[]
  ).includes(chartKey);
}

export function isDashboardAnalyticsBehaviorReinforcementPackChartKey(
  chartKey: string,
): chartKey is DashboardAnalyticsBehaviorReinforcementPackChartKey {
  return (
    DASHBOARD_ANALYTICS_BEHAVIOR_REINFORCEMENT_PACK_CHART_KEYS as readonly string[]
  ).includes(chartKey);
}

export function getDashboardAnalyticsChartComputation(
  chartKey: DashboardAnalyticsComputedSnapshotChartKey,
): DashboardAnalyticsDataComputation {
  if (
    chartKey === 'settings.email_connection_readiness' ||
    chartKey === 'settings.login_identity_readiness'
  ) {
    return 'dashboard_alert_readiness_snapshot';
  }

  return 'dashboard_summary_snapshot';
}

export function getDashboardAnalyticsAttendanceComputation(
  chartKey: DashboardAnalyticsAttendancePackChartKey,
): DashboardAnalyticsDataComputation {
  switch (chartKey) {
    case 'attendance.daily_trend':
      return 'attendance_observation_daily_trend';
    case 'attendance.status_distribution':
      return 'attendance_observation_status_distribution';
    case 'attendance.absence_rate':
      return 'attendance_observation_absence_rate';
    case 'attendance.late_rate':
      return 'attendance_observation_late_rate';
    case 'attendance.excuse_status':
      return 'attendance_excuse_status_distribution';
  }
}

export function getDashboardAnalyticsAdmissionsStudentsComputation(
  chartKey: DashboardAnalyticsAdmissionsStudentsPackChartKey,
): DashboardAnalyticsDataComputation {
  switch (chartKey) {
    case 'admissions.applications_by_status':
      return 'admissions_current_application_status_distribution';
    case 'admissions.applications_over_time':
      return 'admissions_application_submission_acceptance_events';
    case 'students.enrollment_growth':
      return 'students_point_in_time_active_enrollment_stock';
    case 'students.withdrawal_trend':
      return 'students_withdrawal_events';
    case 'students.guardian_coverage':
      return 'students_current_guardian_coverage';
  }
}

export function getDashboardAnalyticsAcademicsComputation(
  chartKey: DashboardAnalyticsAcademicsPackChartKey,
): DashboardAnalyticsDataComputation {
  switch (chartKey) {
    case 'academics.teacher_allocation_coverage':
      return 'academics_teacher_allocation_coverage';
    case 'academics.timetable_publication_status':
      return 'academics_current_timetable_publication_status';
    case 'academics.curriculum_activation':
      return 'academics_current_curriculum_activation_status';
    case 'academics.lesson_plan_activation':
      return 'academics_current_lesson_plan_activation_status';
  }
}

export function getDashboardAnalyticsGradesHomeworkComputation(
  chartKey: DashboardAnalyticsGradesHomeworkPackChartKey,
): DashboardAnalyticsDataComputation {
  switch (chartKey) {
    case 'grades.assessment_status_distribution':
      return 'grades_current_assessment_status_distribution';
    case 'grades.gradebook_completion':
      return 'grades_current_gradebook_completion';
    case 'homework.assignment_status_distribution':
      return 'homework_current_assignment_status_distribution';
    case 'homework.submission_review_trend':
      return 'homework_submission_review_trend';
    case 'homework.grade_sync_coverage':
      return 'homework_current_grade_sync_link_coverage';
  }
}

export function getDashboardAnalyticsBehaviorReinforcementComputation(
  chartKey: DashboardAnalyticsBehaviorReinforcementPackChartKey,
): DashboardAnalyticsDataComputation {
  switch (chartKey) {
    case 'behavior.positive_negative_trend':
      return 'behavior_approved_positive_negative_trend';
    case 'behavior.pending_review':
      return 'behavior_current_pending_review';
    case 'behavior.records_by_category':
      return 'behavior_approved_records_by_category';
    case 'reinforcement.xp_activity_trend':
      return 'reinforcement_xp_activity_trend';
    case 'reinforcement.task_completion':
      return 'reinforcement_current_assignment_completion';
    case 'reinforcement.reward_redemption_status':
      return 'reinforcement_reward_redemption_funnel';
  }
}
