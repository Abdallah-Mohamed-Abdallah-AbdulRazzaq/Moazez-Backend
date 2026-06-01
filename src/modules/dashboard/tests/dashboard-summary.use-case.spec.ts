import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../common/context/request-context';
import { ScopeMissingException } from '../../iam/auth/domain/auth.exceptions';
import { GetDashboardSummaryUseCase } from '../application/get-dashboard-summary.use-case';
import { DashboardSummaryRepository } from '../infrastructure/dashboard-summary.repository';

describe('GetDashboardSummaryUseCase', () => {
  it('requires school scope and delegates read aggregation to the repository', async () => {
    const repository = repositoryMock();
    const useCase = new GetDashboardSummaryUseCase(repository as any);

    const response = await withSchoolScope(() => useCase.execute());

    expect(repository.loadSummarySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
      }),
      expect.objectContaining({
        now: expect.any(Date),
        todayStart: expect.any(Date),
        last7DaysStart: expect.any(Date),
        last30DaysStart: expect.any(Date),
      }),
    );
    expect(response.cards.students.activeStudents).toBe(10);
    expect(repository.createAuditLog).not.toHaveBeenCalled();
    expect(repository.updateDashboardAlert).not.toHaveBeenCalled();
  });

  it('rejects callers without an active school scope', async () => {
    const repository = repositoryMock();
    const useCase = new GetDashboardSummaryUseCase(repository as any);

    await expect(
      runWithRequestContext(createRequestContext(), async () => {
        setActor({ id: 'platform-user', userType: UserType.PLATFORM_USER });
        return useCase.execute();
      }),
    ).rejects.toBeInstanceOf(ScopeMissingException);
    expect(repository.loadSummarySnapshot).not.toHaveBeenCalled();
  });
});

async function withSchoolScope<T>(fn: () => Promise<T>): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({ id: 'user-1', userType: UserType.SCHOOL_USER });
    setActiveMembership({
      membershipId: 'membership-1',
      organizationId: 'org-1',
      schoolId: 'school-1',
      roleId: 'role-1',
      permissions: ['dashboard.summary.view'],
    });

    return fn();
  });
}

function repositoryMock(): jest.Mocked<
  Pick<DashboardSummaryRepository, 'loadSummarySnapshot'>
> & {
  createAuditLog: jest.Mock;
  updateDashboardAlert: jest.Mock;
} {
  return {
    loadSummarySnapshot: jest.fn().mockResolvedValue({
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
          totalLeads: 0,
          openApplications: 0,
          submittedApplications: 0,
          acceptedApplications: 0,
          pendingTests: 0,
          pendingInterviews: 0,
          recentDecisions: 0,
        },
        students: {
          activeStudents: 10,
          activeEnrollments: 10,
          guardians: 12,
          newEnrollmentsLast30Days: 1,
          withdrawnEnrollments: 0,
        },
        academics: {
          activeAcademicYears: 1,
          hasCurrentAcademicYear: true,
          terms: 2,
          stages: 1,
          grades: 3,
          sections: 3,
          classrooms: 3,
          subjects: 4,
          rooms: 3,
          teacherAllocations: 4,
          curricula: 2,
          lessonPlans: 2,
          timetableEntries: 8,
          publishedTimetablePublications: 1,
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
      },
    }),
    createAuditLog: jest.fn(),
    updateDashboardAlert: jest.fn(),
  };
}
