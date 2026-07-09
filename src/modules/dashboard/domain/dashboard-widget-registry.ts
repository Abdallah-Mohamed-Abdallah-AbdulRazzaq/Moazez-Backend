import {
  DashboardWidgetActionDto,
  DashboardWidgetSource,
  DashboardWidgetType,
} from '../dto/dashboard-widgets.dto';

export interface DashboardWidgetDefinition {
  widgetKey: string;
  type: DashboardWidgetType;
  source: DashboardWidgetSource;
  title: string;
  subtitle: string | null;
  iconKey: string;
  dataLabel: string;
  action: DashboardWidgetActionDto;
}

export const DASHBOARD_WIDGET_REGISTRY: readonly DashboardWidgetDefinition[] = [
  {
    widgetKey: 'students.active',
    type: 'stat-card',
    source: 'students',
    title: 'Active students',
    subtitle: 'Currently active student profiles',
    iconKey: 'users',
    dataLabel: 'Active students',
    action: frontendRoute('Open students', '/students'),
  },
  {
    widgetKey: 'admissions.open_applications',
    type: 'stat-card',
    source: 'admissions',
    title: 'Open applications',
    subtitle: 'Admission applications currently in progress',
    iconKey: 'clipboard-list',
    dataLabel: 'Open applications',
    action: frontendRoute('Open applications', '/admissions/applications'),
  },
  {
    widgetKey: 'attendance.pending_today',
    type: 'action-card',
    source: 'attendance',
    title: 'Attendance sessions pending today',
    subtitle: 'Roll-call sessions still waiting for submission',
    iconKey: 'calendar-check',
    dataLabel: 'Pending attendance sessions',
    action: frontendRoute('Review attendance', '/attendance/roll-call'),
  },
  {
    widgetKey: 'attendance.absences_today',
    type: 'risk-card',
    source: 'attendance',
    title: 'Absences marked today',
    subtitle: 'Absent attendance entries recorded today',
    iconKey: 'user-x',
    dataLabel: 'Absences today',
    action: frontendRoute('Review attendance', '/attendance/roll-call'),
  },
  {
    widgetKey: 'homework.waiting_review',
    type: 'action-card',
    source: 'homework',
    title: 'Homework submissions waiting review',
    subtitle: 'Submitted homework that still needs teacher review',
    iconKey: 'book-open-check',
    dataLabel: 'Homework waiting review',
    action: frontendRoute('Review homework', '/homework/submissions'),
  },
  {
    widgetKey: 'grades.pending_review',
    type: 'action-card',
    source: 'grades',
    title: 'Grade submissions need review',
    subtitle: 'Grade submissions and answers waiting for review',
    iconKey: 'graduation-cap',
    dataLabel: 'Grade reviews pending',
    action: frontendRoute('Review grades', '/grades/submissions'),
  },
  {
    widgetKey: 'behavior.pending_review',
    type: 'action-card',
    source: 'behavior',
    title: 'Behavior records need review',
    subtitle: 'Submitted behavior records awaiting review',
    iconKey: 'clipboard-check',
    dataLabel: 'Behavior reviews pending',
    action: frontendRoute('Review behavior', '/behavior/review'),
  },
  {
    widgetKey: 'reinforcement.pending_reviews',
    type: 'action-card',
    source: 'reinforcement',
    title: 'Reinforcement submissions need review',
    subtitle: 'Reinforcement submissions awaiting approval',
    iconKey: 'award',
    dataLabel: 'Reinforcement reviews pending',
    action: frontendRoute('Review reinforcement', '/reinforcement/reviews'),
  },
  {
    widgetKey: 'communication.moderation_queue',
    type: 'risk-card',
    source: 'communication',
    title: 'Communication moderation queue',
    subtitle: 'Reports waiting for moderation review',
    iconKey: 'message-square-warning',
    dataLabel: 'Moderation reports pending',
    action: frontendRoute('Review moderation', '/communication/moderation'),
  },
  {
    widgetKey: 'settings.email_connection',
    type: 'action-card',
    source: 'settings',
    title: 'Email connection',
    subtitle: 'School email connection readiness',
    iconKey: 'mail-check',
    dataLabel: 'Email connection status',
    action: frontendRoute('Configure email', '/settings/email/connection'),
  },
  {
    widgetKey: 'settings.login_identity',
    type: 'action-card',
    source: 'settings',
    title: 'Login identity',
    subtitle: 'School login identity readiness',
    iconKey: 'key-round',
    dataLabel: 'Login identity status',
    action: frontendRoute(
      'Configure login identity',
      '/settings/login-identity',
    ),
  },
  {
    widgetKey: 'activity.recent',
    type: 'timeline-card',
    source: 'activity',
    title: 'Recent activity',
    subtitle: 'Latest safe operational activity preview',
    iconKey: 'activity',
    dataLabel: 'Recent activity',
    action: frontendRoute('Open activity feed', '/dashboard/activity-feed'),
  },
];

export const DASHBOARD_WIDGET_KEYS = DASHBOARD_WIDGET_REGISTRY.map(
  (definition) => definition.widgetKey,
);

export function findDashboardWidgetDefinition(
  widgetKey: string,
): DashboardWidgetDefinition | undefined {
  return DASHBOARD_WIDGET_REGISTRY.find(
    (definition) => definition.widgetKey === widgetKey,
  );
}

function frontendRoute(
  label: string,
  target: string,
): DashboardWidgetActionDto {
  return {
    label,
    target,
    kind: 'frontend-route',
  };
}
