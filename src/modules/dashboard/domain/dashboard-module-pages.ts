import { DashboardWidgetTone } from '../dto/dashboard-widgets.dto';

export const DASHBOARD_MODULE_SOURCES = [
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

export const DASHBOARD_MODULE_STATUSES = [
  'available',
  'planned',
  'deferred',
] as const;

export const DASHBOARD_MODULE_CAPABILITY_STATUSES = [
  'available',
  'partial',
  'planned',
  'deferred',
] as const;

export const DASHBOARD_MODULE_DEFAULT_LIMIT = 20;
export const DASHBOARD_MODULE_MAX_LIMIT = 50;

export type DashboardModuleSource = (typeof DASHBOARD_MODULE_SOURCES)[number];
export type DashboardModuleKey = DashboardModuleSource;
export type DashboardModuleStatus = (typeof DASHBOARD_MODULE_STATUSES)[number];
export type DashboardModuleCapabilityStatus =
  (typeof DASHBOARD_MODULE_CAPABILITY_STATUSES)[number];
export type DashboardModuleTone = DashboardWidgetTone;
export type DashboardModuleActionKind = 'frontend-route';
export type DashboardModuleSectionKey = 'overview' | 'widgets' | 'analytics';

export interface DashboardModuleActionDefinition {
  label: string;
  target: string;
  kind: DashboardModuleActionKind;
}

export interface DashboardModuleSectionDefinition {
  sectionKey: DashboardModuleSectionKey;
  title: string;
  status: DashboardModuleCapabilityStatus;
  items: readonly string[];
}

export interface DashboardModuleCapabilitiesDefinition {
  widgets: DashboardModuleCapabilityStatus;
  analyticsDefinitions: DashboardModuleCapabilityStatus;
  analyticsData: DashboardModuleCapabilityStatus;
  drilldowns: 'deferred';
  exports: 'deferred';
  realtime: 'deferred';
}

export interface DashboardModulePageDefinition {
  moduleKey: DashboardModuleKey;
  source: DashboardModuleSource;
  title: string;
  description: string;
  status: DashboardModuleStatus;
  iconKey: string;
  tone: DashboardModuleTone;
  frontendRoute: string;
  sourceRoute: string;
  widgetKeys: readonly string[];
  chartKeys: readonly string[];
  primaryAction: DashboardModuleActionDefinition;
  sections: readonly DashboardModuleSectionDefinition[];
  capabilities: DashboardModuleCapabilitiesDefinition;
}

export const DASHBOARD_MODULE_PAGE_REGISTRY: readonly DashboardModulePageDefinition[] =
  [
    modulePage({
      moduleKey: 'admissions',
      title: 'Admissions',
      description: 'Admissions operational dashboard.',
      iconKey: 'clipboard-list',
      tone: 'info',
      sourceRoute: '/admissions/applications',
      widgetKeys: ['admissions.open_applications'],
      chartKeys: [
        'admissions.funnel',
        'admissions.applications_by_status',
        'admissions.applications_over_time',
      ],
      analyticsData: 'planned',
    }),
    modulePage({
      moduleKey: 'students',
      title: 'Students',
      description: 'Student lifecycle operational dashboard.',
      iconKey: 'users',
      tone: 'info',
      sourceRoute: '/students',
      widgetKeys: ['students.active'],
      chartKeys: [
        'students.enrollment_growth',
        'students.withdrawal_trend',
        'students.guardian_coverage',
      ],
      analyticsData: 'planned',
    }),
    modulePage({
      moduleKey: 'academics',
      title: 'Academics',
      description: 'Academic structure and readiness dashboard.',
      iconKey: 'school',
      tone: 'warning',
      sourceRoute: '/academics/structure',
      widgetKeys: [],
      chartKeys: [
        'academics.structure_readiness',
        'academics.subject_allocation_coverage',
        'academics.teacher_allocation_coverage',
        'academics.timetable_publication_status',
        'academics.curriculum_activation',
        'academics.lesson_plan_activation',
      ],
      analyticsData: 'planned',
      widgets: 'planned',
    }),
    modulePage({
      moduleKey: 'attendance',
      title: 'Attendance',
      description: 'Attendance operational dashboard.',
      iconKey: 'calendar-check',
      tone: 'info',
      sourceRoute: '/attendance/roll-call',
      widgetKeys: ['attendance.pending_today', 'attendance.absences_today'],
      chartKeys: [
        'attendance.daily_trend',
        'attendance.status_distribution',
        'attendance.absence_rate',
        'attendance.late_rate',
        'attendance.pending_sessions',
        'attendance.excuse_status',
      ],
      analyticsData: 'partial',
    }),
    modulePage({
      moduleKey: 'grades',
      title: 'Grades',
      description: 'Grades review and gradebook dashboard.',
      iconKey: 'graduation-cap',
      tone: 'warning',
      sourceRoute: '/grades/submissions',
      widgetKeys: ['grades.pending_review'],
      chartKeys: [
        'grades.assessment_status_distribution',
        'grades.pending_submission_reviews',
        'grades.pending_answer_reviews',
        'grades.gradebook_completion',
      ],
      analyticsData: 'partial',
    }),
    modulePage({
      moduleKey: 'homework',
      title: 'Homework',
      description: 'Homework assignment and submission dashboard.',
      iconKey: 'book-open-check',
      tone: 'warning',
      sourceRoute: '/homework/submissions',
      widgetKeys: ['homework.waiting_review'],
      chartKeys: [
        'homework.assignment_status_distribution',
        'homework.submission_review_trend',
        'homework.grade_sync_coverage',
      ],
      analyticsData: 'planned',
    }),
    modulePage({
      moduleKey: 'behavior',
      title: 'Behavior',
      description: 'Behavior records and review dashboard.',
      iconKey: 'clipboard-check',
      tone: 'warning',
      sourceRoute: '/behavior/review',
      widgetKeys: ['behavior.pending_review'],
      chartKeys: [
        'behavior.positive_negative_trend',
        'behavior.pending_review',
        'behavior.records_by_category',
      ],
      analyticsData: 'planned',
    }),
    modulePage({
      moduleKey: 'reinforcement',
      title: 'Reinforcement',
      description: 'Reinforcement review and reward dashboard.',
      iconKey: 'award',
      tone: 'warning',
      sourceRoute: '/reinforcement/reviews',
      widgetKeys: ['reinforcement.pending_reviews'],
      chartKeys: [
        'reinforcement.xp_activity_trend',
        'reinforcement.task_completion',
        'reinforcement.reward_redemption_status',
      ],
      analyticsData: 'planned',
    }),
    modulePage({
      moduleKey: 'communication',
      title: 'Communication',
      description: 'Communication moderation and announcement dashboard.',
      iconKey: 'message-square-warning',
      tone: 'critical',
      sourceRoute: '/communication/moderation',
      widgetKeys: ['communication.moderation_queue'],
      chartKeys: [
        'communication.message_volume',
        'communication.announcement_status',
        'communication.moderation_queue',
      ],
      analyticsData: 'partial',
    }),
    modulePage({
      moduleKey: 'settings',
      title: 'Settings',
      description: 'School settings readiness dashboard.',
      iconKey: 'settings',
      tone: 'warning',
      sourceRoute: '/settings',
      widgetKeys: ['settings.email_connection', 'settings.login_identity'],
      chartKeys: [
        'settings.email_connection_readiness',
        'settings.login_identity_readiness',
        'settings.notification_readiness',
      ],
      analyticsData: 'partial',
    }),
  ];

export const DASHBOARD_MODULE_KEYS = DASHBOARD_MODULE_PAGE_REGISTRY.map(
  (definition) => definition.moduleKey,
);

export function findDashboardModulePageDefinition(
  moduleKey: string,
): DashboardModulePageDefinition | undefined {
  return DASHBOARD_MODULE_PAGE_REGISTRY.find(
    (definition) => definition.moduleKey === moduleKey,
  );
}

function modulePage(input: {
  moduleKey: DashboardModuleKey;
  title: string;
  description: string;
  iconKey: string;
  tone: DashboardModuleTone;
  sourceRoute: string;
  widgetKeys: readonly string[];
  chartKeys: readonly string[];
  analyticsData: DashboardModuleCapabilityStatus;
  widgets?: DashboardModuleCapabilityStatus;
}): DashboardModulePageDefinition {
  return {
    moduleKey: input.moduleKey,
    source: input.moduleKey,
    title: input.title,
    description: input.description,
    status: 'available',
    iconKey: input.iconKey,
    tone: input.tone,
    frontendRoute: `/dashboard/modules/${input.moduleKey}`,
    sourceRoute: input.sourceRoute,
    widgetKeys: input.widgetKeys,
    chartKeys: input.chartKeys,
    primaryAction: {
      label: `Open ${input.title}`,
      target: input.sourceRoute,
      kind: 'frontend-route',
    },
    sections: [
      {
        sectionKey: 'overview',
        title: 'Overview',
        status: 'available',
        items: ['quickStats', 'risks', 'actions'],
      },
      {
        sectionKey: 'widgets',
        title: 'Widgets',
        status: input.widgets ?? 'available',
        items: input.widgetKeys,
      },
      {
        sectionKey: 'analytics',
        title: 'Analytics',
        status: input.analyticsData,
        items: input.chartKeys,
      },
    ],
    capabilities: {
      widgets: input.widgets ?? 'available',
      analyticsDefinitions: 'available',
      analyticsData: input.analyticsData,
      drilldowns: 'deferred',
      exports: 'deferred',
      realtime: 'deferred',
    },
  };
}
