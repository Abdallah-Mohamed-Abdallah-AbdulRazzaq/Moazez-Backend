import { presentDashboardSummary } from '../presenters/dashboard-summary.presenter';
import { DashboardSummarySnapshot } from '../infrastructure/dashboard-summary.repository';

describe('Dashboard summary presenter', () => {
  it('presents compact school summary cards, deferred surfaces, and alert previews', () => {
    const response = presentDashboardSummary(snapshot());

    expect(response).toMatchObject({
      generatedAt: '2026-06-01T09:00:00.000Z',
      school: {
        name: 'Moazez Academy',
        timezone: 'Africa/Cairo',
        locale: null,
      },
      academicContext: {
        academicYear: { id: 'year-1', name: '2026/2027' },
        term: { id: 'term-1', name: 'Term 1' },
      },
      cards: {
        admissions: { submittedApplications: 2, pendingTests: 1 },
        attendance: { pendingSessionsToday: 3, absentEntriesToday: 1 },
        grades: { pendingSubmissions: 2, pendingAnswerReviews: 4 },
        communication: { pendingModerationReports: 1 },
      },
      deferred: {
        activityFeed: 'deferred',
        alertsEngine: 'deferred',
        analyticsBuilder: 'out_of_scope_v1',
      },
    });
    expect(response.alertsPreview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'admissions.pending_work',
          severity: 'warning',
          count: 3,
          source: 'admissions',
        }),
        expect.objectContaining({
          key: 'attendance.absences_today',
          severity: 'critical',
          count: 1,
          source: 'attendance',
        }),
        expect.objectContaining({
          key: 'communication.pending_moderation',
          severity: 'critical',
          count: 1,
          source: 'communication',
        }),
      ]),
    );
  });

  it('does not expose tenant identifiers or deferred implementation details', () => {
    const response = presentDashboardSummary(snapshot());
    const serialized = JSON.stringify(response);

    expect(serialized).not.toContain('schoolId');
    expect(serialized).not.toContain('organizationId');
    expect(serialized).not.toContain('activityFeedItems');
    expect(serialized).not.toContain('alertsLifecycle');
  });
});

function snapshot(): DashboardSummarySnapshot {
  return {
    generatedAt: new Date('2026-06-01T09:00:00.000Z'),
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
        absentEntriesToday: 1,
        lateEntriesToday: 2,
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
