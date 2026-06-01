import {
  DashboardAlertPreviewDto,
  DashboardSummaryResponseDto,
} from '../dto/dashboard-summary.dto';
import { DashboardSummarySnapshot } from '../infrastructure/dashboard-summary.repository';

export function presentDashboardSummary(
  snapshot: DashboardSummarySnapshot,
): DashboardSummaryResponseDto {
  return {
    generatedAt: snapshot.generatedAt.toISOString(),
    school: {
      name: snapshot.school.name,
      timezone: snapshot.school.timezone,
      locale: snapshot.school.locale,
    },
    academicContext: {
      academicYear: snapshot.academicContext.academicYear
        ? {
            id: snapshot.academicContext.academicYear.id,
            name: snapshot.academicContext.academicYear.name,
          }
        : null,
      term: snapshot.academicContext.term
        ? {
            id: snapshot.academicContext.term.id,
            name: snapshot.academicContext.term.name,
          }
        : null,
    },
    cards: snapshot.cards,
    alertsPreview: buildAlertsPreview(snapshot),
    deferred: {
      activityFeed: 'deferred',
      alertsEngine: 'deferred',
      analyticsBuilder: 'out_of_scope_v1',
    },
  };
}

function buildAlertsPreview(
  snapshot: DashboardSummarySnapshot,
): DashboardAlertPreviewDto[] {
  const { cards } = snapshot;
  const alerts: DashboardAlertPreviewDto[] = [];

  pushAlert(alerts, {
    key: 'admissions.pending_work',
    severity: 'warning',
    title: 'Admissions work waiting',
    count:
      cards.admissions.submittedApplications +
      cards.admissions.pendingTests +
      cards.admissions.pendingInterviews,
    source: 'admissions',
  });

  pushAlert(alerts, {
    key: 'attendance.pending_today',
    severity: 'warning',
    title: 'Attendance sessions still in draft',
    count: cards.attendance.pendingSessionsToday,
    source: 'attendance',
  });

  pushAlert(alerts, {
    key: 'attendance.absences_today',
    severity: 'critical',
    title: 'Absences marked today',
    count: cards.attendance.absentEntriesToday,
    source: 'attendance',
  });

  pushAlert(alerts, {
    key: 'grades.pending_review',
    severity: 'warning',
    title: 'Grade submissions need review',
    count: cards.grades.pendingSubmissions + cards.grades.pendingAnswerReviews,
    source: 'grades',
  });

  pushAlert(alerts, {
    key: 'homework.waiting_review',
    severity: 'warning',
    title: 'Homework submissions waiting review',
    count: cards.homework.submissionsWaitingReview,
    source: 'homework',
  });

  pushAlert(alerts, {
    key: 'behavior.pending_review',
    severity: 'warning',
    title: 'Behavior records need review',
    count: cards.behavior.pendingReviewRecords,
    source: 'behavior',
  });

  pushAlert(alerts, {
    key: 'reinforcement.pending_reviews',
    severity: 'warning',
    title: 'Reinforcement submissions need review',
    count: cards.reinforcement.pendingReviews,
    source: 'reinforcement',
  });

  pushAlert(alerts, {
    key: 'communication.pending_moderation',
    severity: 'critical',
    title: 'Communication reports need moderation',
    count: cards.communication.pendingModerationReports,
    source: 'communication',
  });

  return alerts
    .sort((left, right) => {
      const severityDiff =
        severityRank(left.severity) - severityRank(right.severity);
      return severityDiff !== 0 ? severityDiff : right.count - left.count;
    })
    .slice(0, 6);
}

function pushAlert(
  alerts: DashboardAlertPreviewDto[],
  alert: DashboardAlertPreviewDto,
): void {
  if (alert.count > 0) {
    alerts.push(alert);
  }
}

function severityRank(severity: DashboardAlertPreviewDto['severity']): number {
  if (severity === 'critical') return 0;
  if (severity === 'warning') return 1;
  return 2;
}
