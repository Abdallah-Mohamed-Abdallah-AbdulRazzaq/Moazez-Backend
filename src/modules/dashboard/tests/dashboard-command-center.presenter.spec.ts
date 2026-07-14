import { UserType } from '@prisma/client';
import { DashboardActivityFeedItemDto } from '../dto/dashboard-activity-feed.dto';
import { DashboardAlertDto } from '../dto/dashboard-alerts.dto';
import { presentDashboardCommandCenter } from '../presenters/dashboard-command-center.presenter';
import { DashboardSummarySnapshot } from '../infrastructure/dashboard-summary.repository';
import { buildDashboardTimeContext } from '../domain/dashboard-time-context';
import { DashboardWidgetDto } from '../dto/dashboard-widgets.dto';

const GENERATED_AT = new Date('2026-07-09T12:00:00.000Z');

describe('Dashboard command center presenter', () => {
  it('returns the stable command center response shape', () => {
    const response = presentDashboardCommandCenter({
      timeContext: commandCenterTimeContext(),
      summary: snapshot(),
      alerts: alerts(),
      activityItems: [activityItem()],
      compositionWidgets: compositionWidgets(),
      operator: {
        userType: UserType.SCHOOL_USER,
      },
    });

    expect(response).toMatchObject({
      generatedAt: '2026-07-09T12:00:00.000Z',
      school: {
        name: 'Moazez Academy',
        timezone: 'Africa/Cairo',
        locale: null,
      },
      academicContext: {
        academicYear: { id: 'year-1', name: '2026/2027' },
        term: { id: 'term-1', name: 'Term 1' },
      },
      operator: {
        displayName: 'School operator',
        userType: UserType.SCHOOL_USER,
      },
      today: {
        date: '2026-07-09',
        dayOfWeek: 'Thursday',
        timezone: 'Africa/Cairo',
      },
      meta: {
        source: 'dashboard_command_center',
        version: 'v2',
        dataFreshness: 'live',
      },
    });
    for (const section of [
      'quickStats',
      'operationalHealth',
      'moduleReadiness',
      'topRisks',
      'topActions',
      'alertsPreview',
      'activityPreview',
      'analyticsPreview',
    ]) {
      expect(response).toHaveProperty(section);
      expect(Array.isArray(response[section as keyof typeof response])).toBe(
        true,
      );
    }
  });

  it('builds quick stats, readiness, risks, and actions from summary and alert signals', () => {
    const response = presentDashboardCommandCenter({
      timeContext: commandCenterTimeContext(),
      summary: snapshot(),
      alerts: alerts(),
      activityItems: [],
      compositionWidgets: compositionWidgets(),
      operator: {
        userType: UserType.SCHOOL_USER,
      },
    });

    expect(response.quickStats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'students.active',
          value: 120,
          action: {
            label: 'Open students',
            target: '/students',
            kind: 'frontend-route',
          },
        }),
        expect.objectContaining({
          key: 'grades.pending_reviews',
          value: 6,
        }),
      ]),
    );
    expect(response.operationalHealth).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'settings.email_connection',
          status: 'warning',
          score: 0,
        }),
      ]),
    );
    expect(response.moduleReadiness.map((entry) => entry.source)).toEqual([
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
    ]);
    expect(response.topRisks.map((risk) => risk.key)).toContain(
      'communication.moderation_reports_pending',
    );
    expect(response.topActions.map((action) => action.key)).toEqual(
      expect.arrayContaining([
        'settings.configure_email',
        'grades.review_pending_submissions',
        'communication.review_moderation',
      ]),
    );
  });

  it('preserves deferred flags and hides tenant/internal identifiers', () => {
    const response = presentDashboardCommandCenter({
      timeContext: commandCenterTimeContext(),
      summary: {
        ...snapshot(),
        schoolId: 'school-1',
        organizationId: 'org-1',
      } as DashboardSummarySnapshot,
      alerts: [
        {
          ...alert({
            key: 'settings.email_connection_missing',
            source: 'settings',
            severity: 'warning',
            count: 1,
          }),
          schoolId: 'school-1',
          organizationId: 'org-1',
          raw: { schoolId: 'school-1' },
        } as DashboardAlertDto,
      ],
      activityItems: [
        {
          ...activityItem(),
          actor: {
            id: 'actor-1',
            displayName: 'Actor One',
            type: 'admin',
          },
          subject: {
            type: 'homework_submission',
            id: 'resource-1',
            label: 'Homework Submission',
          },
          schoolId: 'school-1',
          organizationId: 'org-1',
          raw: { auditLogId: 'audit-1' },
        } as DashboardActivityFeedItemDto,
      ],
      compositionWidgets: compositionWidgets(),
      operator: {
        userType: UserType.SCHOOL_USER,
      },
    });

    expect(response.meta.deferred).toEqual({
      widgets: 'available',
      analytics: 'available',
      analyticsPreview: 'available',
      lightModeDropdown: 'foundation',
      todos: 'persisted',
      todoPreview: 'available',
      weather: 'deferred',
      planner: 'deferred',
      alertLifecycle: 'deferred',
      realtime: 'deferred',
    });
    expect(response.meta.freshness).toEqual({
      dataMode: 'request_time_snapshot',
      cacheStatus: 'not_used',
      realtimeStatus: 'not_used',
    });

    const serialized = JSON.stringify(response);
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'passwordHash',
      'deletedAt',
      'actor-1',
      'resource-1',
      'auditLogId',
      'raw',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('handles minimal data with stable arrays and UTC fallback for today', () => {
    const response = presentDashboardCommandCenter({
      timeContext: commandCenterTimeContext('UTC'),
      summary: {
        ...snapshot(),
        school: { name: 'Minimal School', timezone: null, locale: null },
        academicContext: { academicYear: null, term: null },
        cards: zeroCards(),
      },
      alerts: [],
      activityItems: [],
      compositionWidgets: compositionWidgets(),
      operator: {
        userType: UserType.SCHOOL_USER,
      },
    });

    expect(response.today).toEqual({
      date: '2026-07-09',
      dayOfWeek: 'Thursday',
      timezone: 'UTC',
    });
    expect(response.school.timezone).toBe('UTC');
    expect(response.quickStats).toHaveLength(6);
    expect(response.topRisks).toEqual([]);
    expect(response.alertsPreview).toEqual([]);
    expect(response.activityPreview).toEqual([]);
    expect(response.analyticsPreview.map((item) => item.chartKey)).toEqual([
      'students.enrollment_growth',
      'attendance.daily_trend',
      'communication.message_volume',
    ]);
    expect(Object.keys(response.analyticsPreview[0]).sort()).toEqual(
      [
        'action',
        'analytics',
        'chartKey',
        'empty',
        'series',
        'source',
        'summary',
        'title',
        'totals',
        'type',
      ].sort(),
    );
    expect(response.todoPreview).toEqual({
      date: '2026-07-09',
      items: [],
      summary: { total: 0, pending: 0, completed: 0 },
      action: {
        label: 'Open todos',
        target: '/dashboard/light-mode-dropdown',
        kind: 'frontend-route',
      },
    });
  });

  it.each([
    ['invalid', 'Invalid/Timezone'],
    ['blank', '   '],
    ['absent', null],
  ])(
    'exposes one UTC effective timezone when the configured timezone is %s',
    (_label, configuredTimezone) => {
      const response = presentDashboardCommandCenter({
        timeContext: commandCenterTimeContext(configuredTimezone),
        summary: {
          ...snapshot(),
          school: {
            ...snapshot().school,
            timezone: configuredTimezone,
          },
        },
        alerts: [],
        activityItems: [],
        compositionWidgets: compositionWidgets(),
        operator: { userType: UserType.SCHOOL_USER },
      });

      expect(response.generatedAt).toBe(GENERATED_AT.toISOString());
      expect(response.school.timezone).toBe('UTC');
      expect(response.today).toMatchObject({
        date: '2026-07-09',
        timezone: 'UTC',
      });
    },
  );
});

function compositionWidgets(): DashboardWidgetDto[] {
  const analytics = [
    'students.enrollment_growth',
    'attendance.daily_trend',
    'communication.message_volume',
  ].map((widgetKey) => ({
    widgetKey,
    type: 'mini-chart-card' as const,
    source: widgetKey.split('.')[0] as DashboardWidgetDto['source'],
    title: widgetKey,
    subtitle: null,
    iconKey: 'chart',
    tone: 'neutral' as const,
    data: { series: [], totals: {}, summary: null, empty: true },
    action: {
      label: 'Open analytics',
      target: '/dashboard/analytics',
      kind: 'frontend-route' as const,
    },
    emptyState: null,
    meta: {
      freshness: 'live' as const,
      freshnessDetails: {
        dataMode: 'request_time_snapshot' as const,
        cacheStatus: 'not_used' as const,
        realtimeStatus: 'not_used' as const,
      },
      analytics: analyticsReference(widgetKey),
    },
  }));

  return [
    ...analytics,
    {
      widgetKey: 'todos.today',
      type: 'todo-card',
      source: 'todos',
      title: 'Today’s todos',
      subtitle: null,
      iconKey: 'list-todo',
      tone: 'neutral',
      data: {
        date: '2026-07-09',
        items: [],
        summary: { total: 0, pending: 0, completed: 0 },
      },
      action: {
        label: 'Open todos',
        target: '/dashboard/light-mode-dropdown',
        kind: 'frontend-route',
      },
      emptyState: null,
      meta: {
        freshness: 'live',
        freshnessDetails: {
          dataMode: 'persisted_user_data',
          cacheStatus: 'not_used',
          realtimeStatus: 'not_used',
        },
        analytics: null,
      },
    },
  ] as DashboardWidgetDto[];
}

function analyticsReference(widgetKey: string) {
  const references = {
    'students.enrollment_growth': {
      chartType: 'line',
      pack: 'admissions_students_v1',
      computation: 'students_active_enrollment_stock',
    },
    'attendance.daily_trend': {
      chartType: 'line',
      pack: 'attendance_v1',
      computation: 'attendance_daily_status_counts',
    },
    'communication.message_volume': {
      chartType: 'area',
      pack: 'communication_settings_v1',
      computation: 'communication_message_volume_trend',
    },
  } as const;
  const reference = references[widgetKey as keyof typeof references];

  return {
    chartKey: widgetKey,
    chartType: reference.chartType,
    definitionEndpoint: `/api/v1/dashboard/analytics/charts/${widgetKey}`,
    dataEndpoint: `/api/v1/dashboard/analytics/charts/${widgetKey}/data`,
    defaultRange: '30d' as const,
    defaultGranularity: 'day' as const,
    dataAvailability: 'computed_series' as const,
    pack: reference.pack,
    computation: reference.computation,
  };
}

function alerts(): DashboardAlertDto[] {
  return [
    alert({
      key: 'communication.moderation_reports_pending',
      source: 'communication',
      severity: 'critical',
      count: 1,
    }),
    alert({
      key: 'settings.email_connection_missing',
      source: 'settings',
      severity: 'warning',
      count: 1,
    }),
  ];
}

function alert(
  overrides: Pick<DashboardAlertDto, 'key' | 'source' | 'severity' | 'count'>,
): DashboardAlertDto {
  return {
    title: 'Alert title',
    description: 'Alert description',
    action: {
      label: 'Open',
      target: '/dashboard',
    },
    ...overrides,
  };
}

function activityItem(): DashboardActivityFeedItemDto {
  return {
    activityId: 'audit:activity-1',
    source: 'homework',
    eventType: 'homework.submission.review',
    title: 'Homework reviewed',
    description: 'A homework submission was reviewed.',
    actor: {
      id: 'teacher-1',
      displayName: 'Teacher One',
      type: 'teacher',
    },
    subject: {
      type: 'homework_submission',
      id: 'submission-1',
      label: 'Homework Submission',
    },
    occurredAt: '2026-07-09T11:00:00.000Z',
  };
}

function snapshot(): DashboardSummarySnapshot {
  return {
    generatedAt: new Date('2026-07-09T12:00:00.000Z'),
    school: {
      name: 'Moazez Academy',
      timezone: 'Africa/Cairo',
      locale: null,
    },
    academicContext: {
      academicYear: { id: 'year-1', name: '2026/2027' },
      term: { id: 'term-1', name: 'Term 1', academicYearId: 'year-1' },
    },
    cards: {
      ...zeroCards(),
      admissions: {
        totalLeads: 5,
        openApplications: 4,
        submittedApplications: 2,
        acceptedApplications: 1,
        pendingTests: 1,
        pendingInterviews: 0,
        recentDecisions: 1,
      },
      students: {
        activeStudents: 120,
        activeEnrollments: 118,
        guardians: 180,
        newEnrollmentsLast30Days: 3,
        withdrawnEnrollments: 1,
      },
      academics: {
        activeAcademicYears: 1,
        hasCurrentAcademicYear: true,
        terms: 2,
        stages: 3,
        grades: 9,
        sections: 18,
        classrooms: 18,
        subjects: 12,
        rooms: 14,
        teacherAllocations: 22,
        curricula: 8,
        lessonPlans: 16,
        timetableEntries: 40,
        publishedTimetablePublications: 1,
      },
      attendance: {
        todaySessions: 10,
        submittedSessionsToday: 7,
        pendingSessionsToday: 3,
        absentEntriesToday: 2,
        lateEntriesToday: 1,
        pendingExcuses: 1,
      },
      grades: {
        activeAssessments: 7,
        draftAssessments: 1,
        publishedAssessments: 3,
        approvedAssessments: 3,
        lockedAssessments: 1,
        gradeItems: 50,
        pendingSubmissions: 2,
        pendingAnswerReviews: 4,
      },
      homework: {
        draftAssignments: 2,
        publishedAssignments: 5,
        closedAssignments: 1,
        submissionsWaitingReview: 3,
        reviewedSubmissions: 6,
        gradeSyncLinkedAssignments: 1,
        gradeSyncPendingAssignments: 1,
      },
      behavior: {
        recentRecords: 4,
        pendingReviewRecords: 1,
        positiveRecords: 3,
        negativeRecords: 1,
      },
      reinforcement: {
        activeTasks: 5,
        pendingReviews: 2,
        completedAssignments: 12,
        recentXpLedgerEntries: 8,
        rewardsPending: 1,
      },
      communication: {
        activeAnnouncements: 2,
        recentMessages: 20,
        activeConversations: 9,
        pendingModerationReports: 1,
      },
    },
  };
}

function zeroCards(): DashboardSummarySnapshot['cards'] {
  return {
    admissions: {
      totalLeads: 0,
      openApplications: 0,
      submittedApplications: 0,
      acceptedApplications: 0,
      pendingTests: 0,
      pendingInterviews: 0,
      recentDecisions: 0,
    },
    students: {
      activeStudents: 0,
      activeEnrollments: 0,
      guardians: 0,
      newEnrollmentsLast30Days: 0,
      withdrawnEnrollments: 0,
    },
    academics: {
      activeAcademicYears: 0,
      hasCurrentAcademicYear: false,
      terms: 0,
      stages: 0,
      grades: 0,
      sections: 0,
      classrooms: 0,
      subjects: 0,
      rooms: 0,
      teacherAllocations: 0,
      curricula: 0,
      lessonPlans: 0,
      timetableEntries: 0,
      publishedTimetablePublications: 0,
    },
    attendance: {
      todaySessions: 0,
      submittedSessionsToday: 0,
      pendingSessionsToday: 0,
      absentEntriesToday: 0,
      lateEntriesToday: 0,
      pendingExcuses: 0,
    },
    grades: {
      activeAssessments: 0,
      draftAssessments: 0,
      publishedAssessments: 0,
      approvedAssessments: 0,
      lockedAssessments: 0,
      gradeItems: 0,
      pendingSubmissions: 0,
      pendingAnswerReviews: 0,
    },
    homework: {
      draftAssignments: 0,
      publishedAssignments: 0,
      closedAssignments: 0,
      submissionsWaitingReview: 0,
      reviewedSubmissions: 0,
      gradeSyncLinkedAssignments: 0,
      gradeSyncPendingAssignments: 0,
    },
    behavior: {
      recentRecords: 0,
      pendingReviewRecords: 0,
      positiveRecords: 0,
      negativeRecords: 0,
    },
    reinforcement: {
      activeTasks: 0,
      pendingReviews: 0,
      completedAssignments: 0,
      recentXpLedgerEntries: 0,
      rewardsPending: 0,
    },
    communication: {
      activeAnnouncements: 0,
      recentMessages: 0,
      activeConversations: 0,
      pendingModerationReports: 0,
    },
  };
}

function commandCenterTimeContext(timezone: string | null = 'Africa/Cairo') {
  return buildDashboardTimeContext({
    generatedAt: GENERATED_AT,
    schoolTimezone: timezone,
  });
}
