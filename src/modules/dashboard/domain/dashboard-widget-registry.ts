import {
  DashboardWidgetActionDto,
  DashboardWidgetSource,
  DashboardWidgetType,
} from '../dto/dashboard-widgets.dto';
import { DashboardWidgetCompositionDescriptor } from './dashboard-widget-composition';

export interface DashboardWidgetDefinition {
  widgetKey: string;
  type: DashboardWidgetType;
  source: DashboardWidgetSource;
  title: string;
  subtitle: string | null;
  iconKey: string;
  dataLabel: string;
  action: DashboardWidgetActionDto;
  composition: DashboardWidgetCompositionDescriptor;
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
    composition: dependency('summary'),
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
    composition: dependency('summary'),
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
    composition: dependency('summary'),
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
    composition: dependency('summary'),
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
    composition: dependency('summary'),
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
    composition: dependency('summary'),
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
    composition: dependency('summary'),
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
    composition: dependency('summary'),
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
    composition: dependency('summary'),
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
    composition: dependency('alerts'),
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
    composition: dependency('alerts'),
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
    composition: dependency('activity'),
  },
  {
    widgetKey: 'students.enrollment_growth',
    type: 'mini-chart-card',
    source: 'students',
    title: 'Enrollment growth',
    subtitle: null,
    iconKey: 'users-round',
    dataLabel: 'Enrollment growth',
    action: frontendRoute('Open analytics', '/dashboard/analytics'),
    composition: analytics('students.enrollment_growth'),
  },
  {
    widgetKey: 'attendance.daily_trend',
    type: 'mini-chart-card',
    source: 'attendance',
    title: 'Attendance daily trend',
    subtitle: null,
    iconKey: 'chart-no-axes-combined',
    dataLabel: 'Attendance daily trend',
    action: frontendRoute('Open analytics', '/dashboard/analytics'),
    composition: analytics('attendance.daily_trend'),
  },
  {
    widgetKey: 'communication.message_volume',
    type: 'mini-chart-card',
    source: 'communication',
    title: 'Message volume',
    subtitle: null,
    iconKey: 'messages-square',
    dataLabel: 'Message volume',
    action: frontendRoute('Open analytics', '/dashboard/analytics'),
    composition: analytics('communication.message_volume'),
  },
  {
    widgetKey: 'academics.teacher_allocation_coverage',
    type: 'progress-card',
    source: 'academics',
    title: 'Teacher allocation coverage',
    subtitle: null,
    iconKey: 'user-round-check',
    dataLabel: 'Teacher allocation coverage',
    action: frontendRoute('Open academics', '/academics/structure'),
    composition: analytics('academics.teacher_allocation_coverage'),
  },
  {
    widgetKey: 'grades.gradebook_completion',
    type: 'progress-card',
    source: 'grades',
    title: 'Gradebook completion',
    subtitle: null,
    iconKey: 'notebook-tabs',
    dataLabel: 'Gradebook completion',
    action: frontendRoute('Open gradebook', '/grades/gradebook'),
    composition: analytics('grades.gradebook_completion', ['summary']),
  },
  {
    widgetKey: 'todos.today',
    type: 'todo-card',
    source: 'todos',
    title: 'Today’s todos',
    subtitle: null,
    iconKey: 'list-todo',
    dataLabel: 'Today’s todos',
    action: frontendRoute('Open todos', '/dashboard/light-mode-dropdown'),
    composition: dependency('todos'),
  },
  {
    widgetKey: 'calendar.today',
    type: 'calendar-card',
    source: 'calendar',
    title: 'Today’s calendar',
    subtitle: null,
    iconKey: 'calendar-days',
    dataLabel: 'Today’s calendar',
    action: frontendRoute('Open planner', '/dashboard/light-mode-dropdown'),
    composition: dependencies('todos', 'calendar', 'planner_items'),
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

function dependency(
  value: DashboardWidgetCompositionDescriptor['dependencies'][number],
): DashboardWidgetCompositionDescriptor {
  return { dependencies: [value], analytics: null };
}

function dependencies(
  ...values: DashboardWidgetCompositionDescriptor['dependencies']
): DashboardWidgetCompositionDescriptor {
  return { dependencies: values, analytics: null };
}

function analytics(
  chartKey: NonNullable<
    DashboardWidgetCompositionDescriptor['analytics']
  >['chartKey'],
  dependencies: DashboardWidgetCompositionDescriptor['dependencies'] = [],
): DashboardWidgetCompositionDescriptor {
  return {
    dependencies,
    analytics: { chartKey, range: '30d', granularity: 'day' },
  };
}
