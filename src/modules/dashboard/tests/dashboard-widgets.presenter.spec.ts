import { DashboardActivityFeedItemDto } from '../dto/dashboard-activity-feed.dto';
import {
  buildDashboardWidgetRegistry,
  presentDashboardWidget,
  presentDashboardWidgets,
} from '../presenters/dashboard-widgets.presenter';
import { DashboardAlertSignals } from '../infrastructure/dashboard-alerts.repository';
import { DashboardSummarySnapshot } from '../infrastructure/dashboard-summary.repository';

describe('Dashboard widgets presenter', () => {
  it('returns the stable widgets list response shape with the required initial registry', () => {
    const response = presentDashboardWidgets({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      summary: snapshot(),
      alertSignals: signals({
        settings: {
          missingLoginIdentity: 1,
          missingActiveEmailConnection: 1,
        },
      }),
      activityItems: [activityItem()],
      filters: {
        limit: 20,
      },
    });

    expect(response).toMatchObject({
      generatedAt: '2026-07-09T12:00:00.000Z',
      widgets: expect.any(Array),
      summary: {
        total: 12,
        byType: expect.any(Object),
        bySource: expect.any(Object),
      },
      filters: {
        source: null,
        type: null,
        limit: 20,
      },
      deferred: {
        customLayouts: 'deferred',
        widgetPreferences: 'deferred',
        analyticsCharts: 'deferred',
        weatherWidgets: 'deferred',
        todoWidgets: 'deferred',
      },
    });
    expect(response.widgets.map((widget) => widget.widgetKey)).toEqual([
      'students.active',
      'admissions.open_applications',
      'attendance.pending_today',
      'attendance.absences_today',
      'homework.waiting_review',
      'grades.pending_review',
      'behavior.pending_review',
      'reinforcement.pending_reviews',
      'communication.moderation_queue',
      'settings.email_connection',
      'settings.login_identity',
      'activity.recent',
    ]);
    expect(response.widgets[0]).toEqual(
      expect.objectContaining({
        type: 'stat-card',
        source: 'students',
        title: 'Active students',
        iconKey: 'users',
        tone: 'info',
        data: {
          value: 120,
          unit: null,
          label: 'Active students',
        },
        action: {
          label: 'Open students',
          target: '/students',
          kind: 'frontend-route',
        },
        emptyState: null,
        meta: {
          freshness: 'live',
        },
      }),
    );
  });

  it('filters by source and type and normalizes the response summary to returned widgets', () => {
    const response = presentDashboardWidgets({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      summary: snapshot(),
      alertSignals: signals(),
      activityItems: [],
      filters: {
        source: 'attendance',
        type: 'risk-card',
        limit: 20,
      },
    });

    expect(response.widgets.map((widget) => widget.widgetKey)).toEqual([
      'attendance.absences_today',
    ]);
    expect(response.summary).toEqual({
      total: 1,
      byType: { 'risk-card': 1 },
      bySource: { attendance: 1 },
    });
    expect(response.filters).toEqual({
      source: 'attendance',
      type: 'risk-card',
      limit: 20,
    });
  });

  it('builds deterministic tones from counts and readiness signals', () => {
    const widgets = buildDashboardWidgetRegistry({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      summary: snapshot(),
      alertSignals: signals({
        settings: {
          missingLoginIdentity: 1,
          missingActiveEmailConnection: 0,
        },
      }),
      activityItems: [],
    });

    expect(findWidget(widgets, 'attendance.pending_today')).toMatchObject({
      tone: 'warning',
      data: expect.objectContaining({
        value: 3,
        status: 'needs_review',
      }),
    });
    expect(findWidget(widgets, 'attendance.absences_today')).toMatchObject({
      tone: 'critical',
      data: expect.objectContaining({
        count: 2,
        riskLevel: 'critical',
      }),
    });
    expect(findWidget(widgets, 'settings.email_connection')).toMatchObject({
      tone: 'success',
      data: expect.objectContaining({
        value: 'active',
      }),
    });
    expect(findWidget(widgets, 'settings.login_identity')).toMatchObject({
      tone: 'warning',
      data: expect.objectContaining({
        value: 'not_configured',
      }),
    });
  });

  it('returns one widget by widgetKey and preserves safe activity preview fields only', () => {
    const response = presentDashboardWidget({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      summary: snapshot(),
      alertSignals: signals(),
      activityItems: [
        {
          ...activityItem(),
          actor: {
            id: 'actor-1',
            displayName: 'Teacher One',
            type: 'teacher',
          },
          subject: {
            type: 'homework_submission',
            id: 'submission-1',
            label: 'Homework Submission',
          },
          schoolId: 'school-1',
          organizationId: 'org-1',
          raw: { auditLogId: 'audit-1' },
        } as DashboardActivityFeedItemDto,
      ],
      widgetKey: 'activity.recent',
    });

    expect(response).toMatchObject({
      generatedAt: '2026-07-09T12:00:00.000Z',
      widget: {
        widgetKey: 'activity.recent',
        type: 'timeline-card',
        data: {
          count: 1,
          items: [
            {
              source: 'homework',
              eventType: 'homework.submission.review',
              actor: {
                displayName: 'Teacher One',
                type: 'teacher',
              },
              subject: {
                type: 'homework_submission',
                label: 'Homework Submission',
              },
            },
          ],
        },
      },
    });

    const serialized = JSON.stringify(response);
    for (const forbidden of [
      'schoolId',
      'organizationId',
      'membershipId',
      'roleId',
      'actor-1',
      'submission-1',
      'auditLogId',
      'raw',
      'passwordHash',
      'deletedAt',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('returns null for unknown widget keys and handles minimal data with stable widgets', () => {
    const input = {
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      summary: {
        ...snapshot(),
        academicContext: { academicYear: null, term: null },
        cards: zeroCards(),
      },
      alertSignals: signals({
        academics: {
          missingActiveAcademicYear: 1,
          missingActiveTerm: 1,
        },
        settings: {
          missingLoginIdentity: 1,
          missingActiveEmailConnection: 1,
        },
      }),
      activityItems: [],
    };

    expect(
      presentDashboardWidget({
        ...input,
        widgetKey: 'unknown.widget',
      }),
    ).toBeNull();

    const response = presentDashboardWidgets({
      ...input,
      filters: {
        limit: 20,
      },
    });
    expect(response.widgets).toHaveLength(12);
    expect(findWidget(response.widgets, 'students.active')).toMatchObject({
      data: {
        value: 0,
        unit: null,
        label: 'Active students',
      },
    });
    expect(findWidget(response.widgets, 'activity.recent')).toMatchObject({
      data: expect.objectContaining({
        items: [],
        count: 0,
      }),
    });
  });
});

function findWidget(widgets: { widgetKey: string }[], widgetKey: string) {
  const widget = widgets.find((candidate) => candidate.widgetKey === widgetKey);
  expect(widget).toBeDefined();
  return widget;
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
    cards: cards(),
  };
}

function cards(): DashboardSummarySnapshot['cards'] {
  return {
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

function signals(
  overrides: {
    admissions?: Partial<DashboardAlertSignals['admissions']>;
    academics?: Partial<DashboardAlertSignals['academics']>;
    attendance?: Partial<DashboardAlertSignals['attendance']>;
    grades?: Partial<DashboardAlertSignals['grades']>;
    homework?: Partial<DashboardAlertSignals['homework']>;
    behavior?: Partial<DashboardAlertSignals['behavior']>;
    reinforcement?: Partial<DashboardAlertSignals['reinforcement']>;
    communication?: Partial<DashboardAlertSignals['communication']>;
    settings?: Partial<DashboardAlertSignals['settings']>;
  } = {},
): DashboardAlertSignals {
  return {
    generatedAt: new Date('2026-07-09T12:00:00.000Z'),
    academicContext: {
      academicYear: { id: 'year-1', name: '2026/2027' },
      term: { id: 'term-1', name: 'Term 1', academicYearId: 'year-1' },
    },
    admissions: {
      applicationsWaitingDecision: 0,
      testsPending: 0,
      interviewsPending: 0,
      ...overrides.admissions,
    },
    academics: {
      missingActiveAcademicYear: 0,
      missingActiveTerm: 0,
      draftTimetableEntries: 0,
      lessonPlansPendingActivation: 0,
      ...overrides.academics,
    },
    attendance: {
      todaySessionsPendingSubmission: 0,
      todayAbsentEntries: 0,
      todayLateEntries: 0,
      pendingExcuses: 0,
      ...overrides.attendance,
    },
    grades: {
      draftAssessments: 0,
      publishedAssessmentsPendingApproval: 0,
      pendingSubmissions: 0,
      pendingAnswerReviews: 0,
      ...overrides.grades,
    },
    homework: {
      submissionsWaitingReview: 0,
      gradedAssignmentsMissingSyncLink: 0,
      pastDueMissingSubmissions: 0,
      ...overrides.homework,
    },
    behavior: {
      pendingReviews: 0,
      recentNegativeRecords: 0,
      ...overrides.behavior,
    },
    reinforcement: {
      pendingReviews: 0,
      overdueActiveTasks: 0,
      ...overrides.reinforcement,
    },
    communication: {
      pendingModerationReports: 0,
      activeAnnouncementsExpiringSoon: 0,
      ...overrides.communication,
    },
    settings: {
      missingLoginIdentity: 0,
      missingActiveEmailConnection: 0,
      ...overrides.settings,
    },
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
      id: null,
      displayName: 'System',
      type: 'system',
    },
    subject: {
      type: 'homework_submission',
      id: null,
      label: 'Homework Submission',
    },
    occurredAt: '2026-07-09T11:00:00.000Z',
  };
}
