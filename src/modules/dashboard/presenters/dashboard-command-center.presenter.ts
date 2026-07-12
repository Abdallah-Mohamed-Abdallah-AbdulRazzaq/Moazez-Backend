import { UserType } from '@prisma/client';
import { DashboardActivityFeedItemDto } from '../dto/dashboard-activity-feed.dto';
import {
  DashboardCommandCenterActionDto,
  DashboardCommandCenterActionPriority,
  DashboardCommandCenterHealthStatus,
  DashboardCommandCenterMetricDto,
  DashboardCommandCenterModuleReadinessDto,
  DashboardCommandCenterNextActionDto,
  DashboardCommandCenterQuickStatDto,
  DashboardCommandCenterResponseDto,
  DashboardCommandCenterRiskDto,
} from '../dto/dashboard-command-center.dto';
import { DashboardAlertDto } from '../dto/dashboard-alerts.dto';
import { DashboardSummarySnapshot } from '../infrastructure/dashboard-summary.repository';
import { DashboardTimeContext } from '../domain/dashboard-time-context';
import { dashboardFreshness } from './dashboard-metadata.presenter';

export interface DashboardCommandCenterPresentationInput {
  timeContext: DashboardTimeContext;
  summary: DashboardSummarySnapshot;
  alerts: DashboardAlertDto[];
  activityItems: DashboardActivityFeedItemDto[];
  operator: {
    userType: UserType;
  };
}

type ReadinessSignal = {
  missingLoginIdentity: boolean;
  missingActiveEmailConnection: boolean;
};

export function presentDashboardCommandCenter(
  input: DashboardCommandCenterPresentationInput,
): DashboardCommandCenterResponseDto {
  const readinessSignals = resolveReadinessSignals(input.alerts);

  return {
    generatedAt: input.timeContext.generatedAt.toISOString(),
    school: {
      name: input.summary.school.name,
      timezone: input.timeContext.timezone,
      locale: input.summary.school.locale,
    },
    academicContext: {
      academicYear: input.summary.academicContext.academicYear
        ? {
            id: input.summary.academicContext.academicYear.id,
            name: input.summary.academicContext.academicYear.name,
          }
        : null,
      term: input.summary.academicContext.term
        ? {
            id: input.summary.academicContext.term.id,
            name: input.summary.academicContext.term.name,
          }
        : null,
    },
    operator: {
      displayName: 'School operator',
      userType: input.operator.userType,
    },
    today: {
      date: input.timeContext.civilDate,
      dayOfWeek: formatDayOfWeekInTimezone(
        input.timeContext.generatedAt,
        input.timeContext.timezone,
      ),
      timezone: input.timeContext.timezone,
    },
    quickStats: buildQuickStats(input.summary),
    operationalHealth: buildOperationalHealth(input.summary, readinessSignals),
    moduleReadiness: buildModuleReadiness(input.summary, readinessSignals),
    topRisks: buildTopRisks(input.alerts),
    topActions: buildTopActions(input.summary, readinessSignals),
    alertsPreview: buildAlertsPreview(input.alerts),
    activityPreview: input.activityItems.slice(0, 6).map((item) => ({
      source: item.source,
      eventType: item.eventType,
      title: item.title,
      description: item.description,
      actor: {
        displayName: item.actor.displayName,
        type: item.actor.type,
      },
      subject: {
        type: item.subject.type,
        label: item.subject.label,
      },
      occurredAt: item.occurredAt,
    })),
    meta: {
      source: 'dashboard_command_center',
      version: 'v2',
      dataFreshness: 'live',
      freshness: dashboardFreshness('request_time_snapshot'),
      deferred: {
        widgets: 'available',
        analytics: 'snapshot_only',
        lightModeDropdown: 'foundation',
        todos: 'persisted',
        weather: 'deferred',
        planner: 'deferred',
        alertLifecycle: 'deferred',
        realtime: 'deferred',
      },
    },
  };
}

function buildQuickStats(
  summary: DashboardSummarySnapshot,
): DashboardCommandCenterQuickStatDto[] {
  const { cards } = summary;

  return [
    quickStat({
      key: 'students.active',
      label: 'Active students',
      value: cards.students.activeStudents,
      tone: 'info',
      iconKey: 'users',
      source: 'students',
      actionLabel: 'Open students',
      actionTarget: '/students',
    }),
    quickStat({
      key: 'admissions.open_applications',
      label: 'Open applications',
      value: cards.admissions.openApplications,
      tone: cards.admissions.openApplications > 0 ? 'warning' : 'success',
      iconKey: 'clipboard-list',
      source: 'admissions',
      actionLabel: 'Open applications',
      actionTarget: '/admissions/applications',
    }),
    quickStat({
      key: 'attendance.pending_today',
      label: 'Attendance pending today',
      value: cards.attendance.pendingSessionsToday,
      tone: cards.attendance.pendingSessionsToday > 0 ? 'warning' : 'success',
      iconKey: 'calendar-check',
      source: 'attendance',
      actionLabel: 'Open roll call',
      actionTarget: '/attendance/roll-call',
    }),
    quickStat({
      key: 'homework.waiting_review',
      label: 'Homework waiting review',
      value: cards.homework.submissionsWaitingReview,
      tone: cards.homework.submissionsWaitingReview > 0 ? 'warning' : 'success',
      iconKey: 'book-open-check',
      source: 'homework',
      actionLabel: 'Review homework',
      actionTarget: '/homework/assignments',
    }),
    quickStat({
      key: 'grades.pending_reviews',
      label: 'Pending grade reviews',
      value:
        cards.grades.pendingSubmissions + cards.grades.pendingAnswerReviews,
      tone:
        cards.grades.pendingSubmissions + cards.grades.pendingAnswerReviews > 0
          ? 'warning'
          : 'success',
      iconKey: 'graduation-cap',
      source: 'grades',
      actionLabel: 'Review gradebook',
      actionTarget: '/grades/gradebook',
    }),
    quickStat({
      key: 'communication.active_conversations',
      label: 'Active conversations',
      value: cards.communication.activeConversations,
      tone: 'info',
      iconKey: 'messages-square',
      source: 'communication',
      actionLabel: 'Open conversations',
      actionTarget: '/communication/conversations',
    }),
  ];
}

function buildOperationalHealth(
  summary: DashboardSummarySnapshot,
  readinessSignals: ReadinessSignal,
) {
  const { cards } = summary;
  const academicReady =
    summary.academicContext.academicYear !== null &&
    summary.academicContext.term !== null &&
    cards.academics.classrooms > 0;
  const attendanceReady =
    cards.attendance.todaySessions === 0 ||
    cards.attendance.pendingSessionsToday === 0;
  const timetablePublished = cards.academics.publishedTimetablePublications > 0;
  const moderationClear = cards.communication.pendingModerationReports === 0;

  return [
    health({
      key: 'academics.structure_ready',
      label: 'Academic structure',
      status: academicReady ? 'healthy' : 'warning',
      score: academicReady ? 100 : 50,
      summary: academicReady
        ? 'Academic year, term, and classroom structure are available.'
        : 'Academic year, term, or classroom structure needs review.',
      source: 'academics',
      actionLabel: 'Open academics',
      actionTarget: '/academics/structure',
    }),
    health({
      key: 'attendance.today_ready',
      label: 'Attendance today',
      status: attendanceReady ? 'healthy' : 'warning',
      score: attendanceReady ? 100 : 50,
      summary: attendanceReady
        ? 'Attendance has no pending sessions for today.'
        : 'Attendance still has draft sessions today.',
      source: 'attendance',
      actionLabel: 'Open roll call',
      actionTarget: '/attendance/roll-call',
    }),
    health({
      key: 'settings.email_connection',
      label: 'Email connection',
      status: readinessSignals.missingActiveEmailConnection
        ? 'warning'
        : 'healthy',
      score: readinessSignals.missingActiveEmailConnection ? 0 : 100,
      summary: readinessSignals.missingActiveEmailConnection
        ? 'School email connection is not active.'
        : 'School email connection is active or verified.',
      source: 'settings',
      actionLabel: 'Configure email',
      actionTarget: '/settings/email/connection',
    }),
    health({
      key: 'settings.login_identity',
      label: 'Login identity',
      status: readinessSignals.missingLoginIdentity
        ? 'not_configured'
        : 'healthy',
      score: readinessSignals.missingLoginIdentity ? 0 : 100,
      summary: readinessSignals.missingLoginIdentity
        ? 'School login identity settings are not configured.'
        : 'School login identity settings are configured.',
      source: 'settings',
      actionLabel: 'Configure login identity',
      actionTarget: '/settings/login-identity',
    }),
    health({
      key: 'academics.timetable_published',
      label: 'Timetable publication',
      status: timetablePublished ? 'healthy' : 'warning',
      score: timetablePublished ? 100 : 50,
      summary: timetablePublished
        ? 'A timetable publication is available.'
        : 'Published timetable coverage needs review.',
      source: 'academics',
      actionLabel: 'Review timetable',
      actionTarget: '/academics/timetable',
    }),
    health({
      key: 'communication.moderation_clear',
      label: 'Moderation clear',
      status: moderationClear ? 'healthy' : 'critical',
      score: moderationClear ? 100 : 0,
      summary: moderationClear
        ? 'No communication moderation reports are pending.'
        : 'Communication moderation reports need review.',
      source: 'communication',
      actionLabel: 'Review moderation',
      actionTarget: '/communication/moderation',
    }),
  ];
}

function buildModuleReadiness(
  summary: DashboardSummarySnapshot,
  readinessSignals: ReadinessSignal,
): DashboardCommandCenterModuleReadinessDto[] {
  const { cards } = summary;

  return [
    readiness({
      source: 'admissions',
      label: 'Admissions',
      checks: [
        metric(
          'open_applications',
          'Open applications',
          cards.admissions.openApplications,
        ),
        metric('pending_tests', 'Pending tests', cards.admissions.pendingTests),
        metric(
          'pending_interviews',
          'Pending interviews',
          cards.admissions.pendingInterviews,
        ),
      ],
      score:
        cards.admissions.openApplications +
          cards.admissions.pendingTests +
          cards.admissions.pendingInterviews >
        0
          ? 75
          : 100,
      summary:
        cards.admissions.openApplications > 0
          ? 'Admissions work is active and has applications to review.'
          : 'Admissions has no open application backlog.',
      actionLabel: 'Open admissions',
      actionTarget: '/admissions/applications',
    }),
    readiness({
      source: 'students',
      label: 'Students',
      checks: [
        metric(
          'active_students',
          'Active students',
          cards.students.activeStudents,
        ),
        metric(
          'active_enrollments',
          'Active enrollments',
          cards.students.activeEnrollments,
        ),
      ],
      score: cards.students.activeStudents > 0 ? 100 : 50,
      summary:
        cards.students.activeStudents > 0
          ? 'Student records are active for this school.'
          : 'No active students are currently visible.',
      actionLabel: 'Open students',
      actionTarget: '/students',
    }),
    readinessFromChecks({
      source: 'academics',
      label: 'Academics',
      checks: [
        metric(
          'academic_year_active',
          'Academic year active',
          summary.academicContext.academicYear !== null,
        ),
        metric(
          'term_active',
          'Term active',
          summary.academicContext.term !== null,
        ),
        metric('classrooms', 'Classrooms', cards.academics.classrooms),
        metric(
          'published_timetable',
          'Published timetable',
          cards.academics.publishedTimetablePublications,
        ),
      ],
      passedChecks: [
        summary.academicContext.academicYear !== null,
        summary.academicContext.term !== null,
        cards.academics.classrooms > 0,
        cards.academics.publishedTimetablePublications > 0,
      ],
      summary:
        'Academic year, term, structure, and timetable publication are checked.',
      actionLabel: 'Open academics',
      actionTarget: '/academics/structure',
    }),
    readiness({
      source: 'attendance',
      label: 'Attendance',
      checks: [
        metric(
          'today_sessions',
          'Today sessions',
          cards.attendance.todaySessions,
        ),
        metric(
          'pending_today',
          'Pending today',
          cards.attendance.pendingSessionsToday,
        ),
      ],
      score: cards.attendance.pendingSessionsToday > 0 ? 70 : 100,
      summary:
        cards.attendance.pendingSessionsToday > 0
          ? 'Attendance has sessions pending submission today.'
          : 'Attendance has no pending sessions today.',
      actionLabel: 'Open attendance',
      actionTarget: '/attendance/roll-call',
    }),
    readiness({
      source: 'grades',
      label: 'Grades',
      checks: [
        metric(
          'active_assessments',
          'Active assessments',
          cards.grades.activeAssessments,
        ),
        metric(
          'pending_reviews',
          'Pending reviews',
          cards.grades.pendingSubmissions + cards.grades.pendingAnswerReviews,
        ),
      ],
      score:
        cards.grades.pendingSubmissions + cards.grades.pendingAnswerReviews > 0
          ? 70
          : 100,
      summary:
        cards.grades.pendingSubmissions + cards.grades.pendingAnswerReviews > 0
          ? 'Grade submissions or answers need review.'
          : 'Grades has no pending review backlog.',
      actionLabel: 'Open gradebook',
      actionTarget: '/grades/gradebook',
    }),
    readiness({
      source: 'homework',
      label: 'Homework',
      checks: [
        metric(
          'published_assignments',
          'Published assignments',
          cards.homework.publishedAssignments,
        ),
        metric(
          'waiting_review',
          'Waiting review',
          cards.homework.submissionsWaitingReview,
        ),
      ],
      score: cards.homework.submissionsWaitingReview > 0 ? 70 : 100,
      summary:
        cards.homework.submissionsWaitingReview > 0
          ? 'Homework submissions are waiting for review.'
          : 'Homework has no waiting review backlog.',
      actionLabel: 'Open homework',
      actionTarget: '/homework/assignments',
    }),
    readiness({
      source: 'behavior',
      label: 'Behavior',
      checks: [
        metric(
          'recent_records',
          'Recent records',
          cards.behavior.recentRecords,
        ),
        metric(
          'pending_review',
          'Pending review',
          cards.behavior.pendingReviewRecords,
        ),
      ],
      score: cards.behavior.pendingReviewRecords > 0 ? 70 : 100,
      summary:
        cards.behavior.pendingReviewRecords > 0
          ? 'Behavior records are pending review.'
          : 'Behavior has no pending review backlog.',
      actionLabel: 'Open behavior',
      actionTarget: '/behavior/records',
    }),
    readiness({
      source: 'reinforcement',
      label: 'Reinforcement',
      checks: [
        metric('active_tasks', 'Active tasks', cards.reinforcement.activeTasks),
        metric(
          'pending_reviews',
          'Pending reviews',
          cards.reinforcement.pendingReviews,
        ),
      ],
      score: cards.reinforcement.pendingReviews > 0 ? 70 : 100,
      summary:
        cards.reinforcement.pendingReviews > 0
          ? 'Reinforcement submissions are pending review.'
          : 'Reinforcement has no pending review backlog.',
      actionLabel: 'Open reinforcement',
      actionTarget: '/reinforcement/tasks',
    }),
    readiness({
      source: 'communication',
      label: 'Communication',
      checks: [
        metric(
          'active_conversations',
          'Active conversations',
          cards.communication.activeConversations,
        ),
        metric(
          'pending_moderation',
          'Pending moderation',
          cards.communication.pendingModerationReports,
        ),
      ],
      score: cards.communication.pendingModerationReports > 0 ? 0 : 100,
      summary:
        cards.communication.pendingModerationReports > 0
          ? 'Communication moderation reports need attention.'
          : 'Communication moderation is clear.',
      actionLabel: 'Open communication',
      actionTarget: '/communication/conversations',
    }),
    readinessFromChecks({
      source: 'settings',
      label: 'Settings',
      checks: [
        metric(
          'login_identity_ready',
          'Login identity ready',
          !readinessSignals.missingLoginIdentity,
        ),
        metric(
          'email_connection_ready',
          'Email connection ready',
          !readinessSignals.missingActiveEmailConnection,
        ),
      ],
      passedChecks: [
        !readinessSignals.missingLoginIdentity,
        !readinessSignals.missingActiveEmailConnection,
      ],
      summary:
        'Login identity and school email connection readiness are checked.',
      actionLabel: 'Open settings',
      actionTarget: '/settings',
    }),
  ];
}

function buildTopRisks(
  alerts: DashboardAlertDto[],
): DashboardCommandCenterRiskDto[] {
  return alerts.slice(0, 6).map((alert) => ({
    key: alert.key,
    severity: alert.severity,
    title: alert.title,
    count: alert.count,
    source: alert.source,
    action: toCommandCenterAction(alert.action.label, alert.action.target),
  }));
}

function buildTopActions(
  summary: DashboardSummarySnapshot,
  readinessSignals: ReadinessSignal,
): DashboardCommandCenterNextActionDto[] {
  const { cards } = summary;
  const actions: DashboardCommandCenterNextActionDto[] = [];

  pushAction(actions, readinessSignals.missingLoginIdentity, {
    key: 'settings.configure_login_identity',
    priority: 'critical',
    label: 'Configure login identity',
    description: 'School login identity settings are not configured.',
    source: 'settings',
    action: toCommandCenterAction(
      'Configure login identity',
      '/settings/login-identity',
    ),
  });
  pushAction(actions, readinessSignals.missingActiveEmailConnection, {
    key: 'settings.configure_email',
    priority: 'high',
    label: 'Configure school email',
    description: 'School email connection is not active.',
    source: 'settings',
    action: toCommandCenterAction(
      'Configure email',
      '/settings/email/connection',
    ),
  });
  pushAction(actions, cards.attendance.pendingSessionsToday > 0, {
    key: 'attendance.review_pending_sessions',
    priority: 'high',
    label: 'Review attendance sessions',
    description: 'Attendance sessions are still in draft today.',
    source: 'attendance',
    action: toCommandCenterAction('Open roll call', '/attendance/roll-call'),
  });
  pushAction(
    actions,
    cards.grades.pendingSubmissions + cards.grades.pendingAnswerReviews > 0,
    {
      key: 'grades.review_pending_submissions',
      priority: 'high',
      label: 'Review pending grades',
      description: 'Grade submissions or answers are waiting for review.',
      source: 'grades',
      action: toCommandCenterAction('Open gradebook', '/grades/gradebook'),
    },
  );
  pushAction(actions, cards.homework.submissionsWaitingReview > 0, {
    key: 'homework.review_waiting_submissions',
    priority: 'medium',
    label: 'Review homework submissions',
    description: 'Homework submissions are waiting for review.',
    source: 'homework',
    action: toCommandCenterAction('Review homework', '/homework/assignments'),
  });
  pushAction(actions, cards.behavior.pendingReviewRecords > 0, {
    key: 'behavior.review_pending_records',
    priority: 'medium',
    label: 'Review behavior records',
    description: 'Behavior records are pending review.',
    source: 'behavior',
    action: toCommandCenterAction('Review behavior', '/behavior/records'),
  });
  pushAction(actions, cards.communication.pendingModerationReports > 0, {
    key: 'communication.review_moderation',
    priority: 'critical',
    label: 'Review moderation reports',
    description: 'Communication moderation reports need attention.',
    source: 'communication',
    action: toCommandCenterAction(
      'Review moderation',
      '/communication/moderation',
    ),
  });
  pushAction(actions, cards.admissions.openApplications > 0, {
    key: 'admissions.review_open_applications',
    priority: 'medium',
    label: 'Review open applications',
    description: 'Admissions applications are waiting for progress.',
    source: 'admissions',
    action: toCommandCenterAction(
      'Review applications',
      '/admissions/applications',
    ),
  });

  return actions.sort(compareNextActions).slice(0, 8);
}

function buildAlertsPreview(alerts: DashboardAlertDto[]) {
  return alerts.slice(0, 6).map((alert) => ({
    key: alert.key,
    severity: alert.severity,
    title: alert.title,
    count: alert.count,
    source: alert.source,
    action: toCommandCenterAction(alert.action.label, alert.action.target),
  }));
}

function resolveReadinessSignals(alerts: DashboardAlertDto[]): ReadinessSignal {
  return {
    missingLoginIdentity: alerts.some(
      (alert) => alert.key === 'settings.login_identity_missing',
    ),
    missingActiveEmailConnection: alerts.some(
      (alert) => alert.key === 'settings.email_connection_missing',
    ),
  };
}

function quickStat(input: {
  key: string;
  label: string;
  value: number;
  tone: DashboardCommandCenterQuickStatDto['tone'];
  iconKey: string;
  source: string;
  actionLabel: string;
  actionTarget: string;
}): DashboardCommandCenterQuickStatDto {
  return {
    key: input.key,
    label: input.label,
    value: input.value,
    unit: null,
    tone: input.tone,
    iconKey: input.iconKey,
    source: input.source,
    action: toCommandCenterAction(input.actionLabel, input.actionTarget),
  };
}

function health(input: {
  key: string;
  label: string;
  status: DashboardCommandCenterHealthStatus;
  score: number;
  summary: string;
  source: string;
  actionLabel: string;
  actionTarget: string;
}) {
  return {
    key: input.key,
    label: input.label,
    status: input.status,
    score: input.score,
    summary: input.summary,
    source: input.source,
    action: toCommandCenterAction(input.actionLabel, input.actionTarget),
  };
}

function readiness(input: {
  source: string;
  label: string;
  checks: DashboardCommandCenterMetricDto[];
  score: number;
  summary: string;
  actionLabel: string;
  actionTarget: string;
}): DashboardCommandCenterModuleReadinessDto {
  return {
    source: input.source,
    label: input.label,
    status: statusFromScore(input.score),
    score: input.score,
    summary: input.summary,
    metrics: input.checks,
    action: toCommandCenterAction(input.actionLabel, input.actionTarget),
  };
}

function readinessFromChecks(input: {
  source: string;
  label: string;
  checks: DashboardCommandCenterMetricDto[];
  passedChecks: boolean[];
  summary: string;
  actionLabel: string;
  actionTarget: string;
}): DashboardCommandCenterModuleReadinessDto {
  const passed = input.passedChecks.filter(Boolean).length;
  const score =
    input.passedChecks.length === 0
      ? 100
      : Math.round((passed / input.passedChecks.length) * 100);

  return readiness({
    source: input.source,
    label: input.label,
    checks: input.checks,
    score,
    summary: input.summary,
    actionLabel: input.actionLabel,
    actionTarget: input.actionTarget,
  });
}

function metric(
  key: string,
  label: string,
  value: string | number | boolean | null,
): DashboardCommandCenterMetricDto {
  return { key, label, value };
}

function statusFromScore(score: number): DashboardCommandCenterHealthStatus {
  if (score >= 100) return 'healthy';
  if (score >= 75) return 'info';
  if (score > 0) return 'warning';
  return 'critical';
}

function pushAction(
  actions: DashboardCommandCenterNextActionDto[],
  condition: boolean,
  action: DashboardCommandCenterNextActionDto,
): void {
  if (condition) {
    actions.push(action);
  }
}

function compareNextActions(
  left: DashboardCommandCenterNextActionDto,
  right: DashboardCommandCenterNextActionDto,
): number {
  const priorityDiff =
    priorityRank(left.priority) - priorityRank(right.priority);
  if (priorityDiff !== 0) return priorityDiff;

  const sourceDiff = left.source.localeCompare(right.source);
  if (sourceDiff !== 0) return sourceDiff;

  return left.key.localeCompare(right.key);
}

function priorityRank(priority: DashboardCommandCenterActionPriority): number {
  if (priority === 'critical') return 0;
  if (priority === 'high') return 1;
  if (priority === 'medium') return 2;
  return 3;
}

function toCommandCenterAction(
  label: string,
  target: string,
): DashboardCommandCenterActionDto {
  return {
    label,
    target,
    kind: 'frontend-route',
  };
}

function formatDayOfWeekInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  }).format(date);
}
