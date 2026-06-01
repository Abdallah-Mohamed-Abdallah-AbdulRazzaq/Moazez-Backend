import { Injectable } from '@nestjs/common';
import { requireDashboardScope } from '../dashboard-context';
import {
  DashboardAlertDto,
  DashboardAlertSeverity,
  DashboardAlertSource,
  DashboardAlertsResponseDto,
  ListDashboardAlertsQueryDto,
} from '../dto/dashboard-alerts.dto';
import {
  DashboardAlertSignals,
  DashboardAlertsDateWindow,
  DashboardAlertsRepository,
} from '../infrastructure/dashboard-alerts.repository';
import { presentDashboardAlerts } from '../presenters/dashboard-alerts.presenter';

const DEFAULT_ALERT_LIMIT = 20;
const MAX_ALERT_LIMIT = 100;

@Injectable()
export class ListDashboardAlertsUseCase {
  constructor(
    private readonly dashboardAlertsRepository: DashboardAlertsRepository,
  ) {}

  async execute(
    query: ListDashboardAlertsQueryDto = new ListDashboardAlertsQueryDto(),
  ): Promise<DashboardAlertsResponseDto> {
    const scope = requireDashboardScope();
    const window = buildDashboardAlertsDateWindow(new Date());
    const signals = await this.dashboardAlertsRepository.loadAlertSignals(
      scope,
      window,
    );

    const alerts = buildDashboardAlerts(signals)
      .filter((alert) => query.includeZeroCount === true || alert.count > 0)
      .filter((alert) => !query.source || alert.source === query.source)
      .filter((alert) => !query.severity || alert.severity === query.severity)
      .sort(compareDashboardAlerts)
      .slice(0, normalizeAlertLimit(query.limit));

    return presentDashboardAlerts({
      generatedAt: signals.generatedAt,
      alerts,
    });
  }
}

export function buildDashboardAlertsDateWindow(
  now: Date,
): DashboardAlertsDateWindow {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const last30DaysStart = new Date(now);
  last30DaysStart.setDate(last30DaysStart.getDate() - 30);

  const next7DaysEnd = new Date(now);
  next7DaysEnd.setDate(next7DaysEnd.getDate() + 7);

  return {
    now,
    todayStart,
    last30DaysStart,
    next7DaysEnd,
  };
}

export function buildDashboardAlerts(
  signals: DashboardAlertSignals,
): DashboardAlertDto[] {
  return [
    alert({
      key: 'admissions.applications_waiting_decision',
      source: 'admissions',
      severity: 'warning',
      title: 'Applications waiting for a decision',
      description: `There are ${signals.admissions.applicationsWaitingDecision} admission applications still waiting for a final decision.`,
      count: signals.admissions.applicationsWaitingDecision,
      action: {
        label: 'Review applications',
        target: '/admissions/applications',
      },
    }),
    alert({
      key: 'admissions.tests_pending',
      source: 'admissions',
      severity: 'warning',
      title: 'Admissions tests pending',
      description: `There are ${signals.admissions.testsPending} placement tests still scheduled or pending completion.`,
      count: signals.admissions.testsPending,
      action: {
        label: 'Review tests',
        target: '/admissions/tests',
      },
    }),
    alert({
      key: 'admissions.interviews_pending',
      source: 'admissions',
      severity: 'warning',
      title: 'Admissions interviews pending',
      description: `There are ${signals.admissions.interviewsPending} admissions interviews still scheduled or pending completion.`,
      count: signals.admissions.interviewsPending,
      action: {
        label: 'Review interviews',
        target: '/admissions/interviews',
      },
    }),
    alert({
      key: 'academics.active_academic_year_missing',
      source: 'academics',
      severity: 'critical',
      title: 'No active academic year',
      description:
        signals.academics.missingActiveAcademicYear > 0
          ? 'No active academic year is configured for this school.'
          : 'An active academic year is configured for this school.',
      count: signals.academics.missingActiveAcademicYear,
      action: {
        label: 'Open academic years',
        target: '/academics/structure',
      },
    }),
    alert({
      key: 'academics.active_term_missing',
      source: 'academics',
      severity: 'critical',
      title: 'No active term',
      description:
        signals.academics.missingActiveTerm > 0
          ? 'No active term is configured for this school.'
          : 'An active term is configured for this school.',
      count: signals.academics.missingActiveTerm,
      action: {
        label: 'Open academic terms',
        target: '/academics/structure',
      },
    }),
    alert({
      key: 'academics.timetable_draft_items',
      source: 'academics',
      severity: 'warning',
      title: 'Timetable items still in draft',
      description: `There are ${signals.academics.draftTimetableEntries} timetable entries still in draft.`,
      count: signals.academics.draftTimetableEntries,
      action: {
        label: 'Review timetable',
        target: '/academics/timetable',
      },
    }),
    alert({
      key: 'academics.lesson_plans_pending_activation',
      source: 'academics',
      severity: 'info',
      title: 'Lesson plans pending activation',
      description: `There are ${signals.academics.lessonPlansPendingActivation} lesson plans still in draft.`,
      count: signals.academics.lessonPlansPendingActivation,
      action: {
        label: 'Review lesson plans',
        target: '/academics/lesson-plans',
      },
    }),
    alert({
      key: 'attendance.sessions_pending_submission',
      source: 'attendance',
      severity: 'warning',
      title: 'Attendance sessions pending submission',
      description: `There are ${signals.attendance.todaySessionsPendingSubmission} attendance sessions still in draft today.`,
      count: signals.attendance.todaySessionsPendingSubmission,
      action: {
        label: 'Open roll call',
        target: '/attendance/roll-call',
      },
    }),
    alert({
      key: 'attendance.absent_entries_today',
      source: 'attendance',
      severity: 'critical',
      title: 'Absences marked today',
      description: `There are ${signals.attendance.todayAbsentEntries} absent attendance entries for today.`,
      count: signals.attendance.todayAbsentEntries,
      action: {
        label: 'Review absences',
        target: '/attendance/absences',
      },
    }),
    alert({
      key: 'attendance.late_entries_today',
      source: 'attendance',
      severity: 'warning',
      title: 'Late arrivals marked today',
      description: `There are ${signals.attendance.todayLateEntries} late attendance entries for today.`,
      count: signals.attendance.todayLateEntries,
      action: {
        label: 'Review attendance',
        target: '/attendance/absences',
      },
    }),
    alert({
      key: 'attendance.excuses_pending',
      source: 'attendance',
      severity: 'warning',
      title: 'Attendance excuses pending review',
      description: `There are ${signals.attendance.pendingExcuses} attendance excuse requests waiting for review.`,
      count: signals.attendance.pendingExcuses,
      action: {
        label: 'Review excuses',
        target: '/attendance/excuses',
      },
    }),
    alert({
      key: 'grades.assessments_in_draft',
      source: 'grades',
      severity: 'info',
      title: 'Assessments still in draft',
      description: `There are ${signals.grades.draftAssessments} grade assessments still in draft.`,
      count: signals.grades.draftAssessments,
      action: {
        label: 'Review assessments',
        target: '/grades/assessments',
      },
    }),
    alert({
      key: 'grades.assessments_pending_approval',
      source: 'grades',
      severity: 'warning',
      title: 'Published assessments pending approval',
      description: `There are ${signals.grades.publishedAssessmentsPendingApproval} published assessments waiting for approval.`,
      count: signals.grades.publishedAssessmentsPendingApproval,
      action: {
        label: 'Approve assessments',
        target: '/grades/assessments',
      },
    }),
    alert({
      key: 'grades.submissions_pending_review',
      source: 'grades',
      severity: 'warning',
      title: 'Grade submissions pending review',
      description: `There are ${signals.grades.pendingSubmissions} submitted question-based assessments waiting for review.`,
      count: signals.grades.pendingSubmissions,
      action: {
        label: 'Review submissions',
        target: '/grades/gradebook',
      },
    }),
    alert({
      key: 'grades.answers_pending_correction',
      source: 'grades',
      severity: 'warning',
      title: 'Assessment answers pending correction',
      description: `There are ${signals.grades.pendingAnswerReviews} assessment answers waiting for correction.`,
      count: signals.grades.pendingAnswerReviews,
      action: {
        label: 'Correct answers',
        target: '/grades/gradebook',
      },
    }),
    alert({
      key: 'homework.submissions_waiting_review',
      source: 'homework',
      severity: 'warning',
      title: 'Homework submissions waiting for review',
      description: `There are ${signals.homework.submissionsWaitingReview} homework submissions waiting for teacher review.`,
      count: signals.homework.submissionsWaitingReview,
      action: {
        label: 'Review submissions',
        target: '/homework/assignments',
      },
    }),
    alert({
      key: 'homework.grade_sync_link_missing',
      source: 'homework',
      severity: 'warning',
      title: 'Graded homework missing grade sync link',
      description: `There are ${signals.homework.gradedAssignmentsMissingSyncLink} graded homework assignments not linked to a grade assessment.`,
      count: signals.homework.gradedAssignmentsMissingSyncLink,
      action: {
        label: 'Review grade sync',
        target: '/homework/assignments',
      },
    }),
    alert({
      key: 'homework.missing_submissions_past_due',
      source: 'homework',
      severity: 'warning',
      title: 'Past-due homework missing submissions',
      description: `There are ${signals.homework.pastDueMissingSubmissions} past-due homework targets marked missing.`,
      count: signals.homework.pastDueMissingSubmissions,
      action: {
        label: 'Review missing submissions',
        target: '/homework/assignments',
      },
    }),
    alert({
      key: 'behavior.records_pending_review',
      source: 'behavior',
      severity: 'warning',
      title: 'Behavior records pending review',
      description: `There are ${signals.behavior.pendingReviews} submitted behavior records waiting for review.`,
      count: signals.behavior.pendingReviews,
      action: {
        label: 'Review behavior',
        target: '/behavior/records',
      },
    }),
    alert({
      key: 'behavior.negative_records_recent',
      source: 'behavior',
      severity: 'warning',
      title: 'Recent negative behavior records',
      description: `There are ${signals.behavior.recentNegativeRecords} negative behavior records from the last 30 days.`,
      count: signals.behavior.recentNegativeRecords,
      action: {
        label: 'Review behavior trends',
        target: '/behavior/overview',
      },
    }),
    alert({
      key: 'reinforcement.submissions_pending_review',
      source: 'reinforcement',
      severity: 'warning',
      title: 'Reinforcement submissions pending review',
      description: `There are ${signals.reinforcement.pendingReviews} reinforcement submissions waiting for review.`,
      count: signals.reinforcement.pendingReviews,
      action: {
        label: 'Review reinforcement',
        target: '/reinforcement/tasks',
      },
    }),
    alert({
      key: 'reinforcement.active_tasks_overdue',
      source: 'reinforcement',
      severity: 'warning',
      title: 'Active reinforcement tasks overdue',
      description: `There are ${signals.reinforcement.overdueActiveTasks} active reinforcement tasks past their due date.`,
      count: signals.reinforcement.overdueActiveTasks,
      action: {
        label: 'Review overdue tasks',
        target: '/reinforcement/tasks',
      },
    }),
    alert({
      key: 'communication.moderation_reports_pending',
      source: 'communication',
      severity: 'critical',
      title: 'Communication reports need moderation',
      description: `There are ${signals.communication.pendingModerationReports} communication reports waiting for moderation.`,
      count: signals.communication.pendingModerationReports,
      action: {
        label: 'Review reports',
        target: '/communication/moderation',
      },
    }),
    alert({
      key: 'communication.announcements_expiring_soon',
      source: 'communication',
      severity: 'info',
      title: 'Announcements expiring soon',
      description: `There are ${signals.communication.activeAnnouncementsExpiringSoon} active announcements expiring in the next 7 days.`,
      count: signals.communication.activeAnnouncementsExpiringSoon,
      action: {
        label: 'Review announcements',
        target: '/communication/announcements',
      },
    }),
    alert({
      key: 'settings.login_identity_missing',
      source: 'settings',
      severity: 'critical',
      title: 'Login identity settings missing',
      description:
        signals.settings.missingLoginIdentity > 0
          ? 'School login identity settings are not configured.'
          : 'School login identity settings are configured.',
      count: signals.settings.missingLoginIdentity,
      action: {
        label: 'Configure login identity',
        target: '/settings/login-identity',
      },
    }),
    alert({
      key: 'settings.email_connection_missing',
      source: 'settings',
      severity: 'warning',
      title: 'School email connection inactive',
      description:
        signals.settings.missingActiveEmailConnection > 0
          ? 'A verified or active school email connection is not configured.'
          : 'A verified or active school email connection is configured.',
      count: signals.settings.missingActiveEmailConnection,
      action: {
        label: 'Configure email',
        target: '/settings/email',
      },
    }),
  ];
}

function alert(params: DashboardAlertDto): DashboardAlertDto {
  return params;
}

function compareDashboardAlerts(
  left: DashboardAlertDto,
  right: DashboardAlertDto,
): number {
  const severityDiff =
    severityRank(left.severity) - severityRank(right.severity);
  if (severityDiff !== 0) return severityDiff;

  const sourceDiff = left.source.localeCompare(right.source);
  if (sourceDiff !== 0) return sourceDiff;

  return left.key.localeCompare(right.key);
}

function severityRank(severity: DashboardAlertSeverity): number {
  if (severity === 'critical') return 0;
  if (severity === 'warning') return 1;
  return 2;
}

function normalizeAlertLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return DEFAULT_ALERT_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_ALERT_LIMIT);
}

export function sortDashboardAlertsForTest(
  alerts: DashboardAlertDto[],
): DashboardAlertDto[] {
  return [...alerts].sort(compareDashboardAlerts);
}

export type DashboardAlertsFilter = {
  source?: DashboardAlertSource;
  severity?: DashboardAlertSeverity;
};
