import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { ListDashboardWidgetsUseCase } from '../../src/modules/dashboard/application/list-dashboard-widgets.use-case';
import { DashboardController } from '../../src/modules/dashboard/controller/dashboard.controller';
import { DashboardActivityFeedRepository } from '../../src/modules/dashboard/infrastructure/dashboard-activity-feed.repository';
import { DashboardAlertsRepository } from '../../src/modules/dashboard/infrastructure/dashboard-alerts.repository';
import { DashboardSummaryRepository } from '../../src/modules/dashboard/infrastructure/dashboard-summary.repository';
import { presentDashboardWidgets } from '../../src/modules/dashboard/presenters/dashboard-widgets.presenter';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { DashboardTimeContextService } from '../../src/modules/dashboard/application/dashboard-time-context.service';
import { DashboardTimeContextRepository } from '../../src/modules/dashboard/infrastructure/dashboard-time-context.repository';

jest.setTimeout(60000);

describe('Dashboard widgets tenancy/security contracts', () => {
  const suffix = randomUUID().split('-')[0];
  const marker = `widgets-security-${suffix}`;

  let prisma: PrismaService;
  let organizationId = '';
  let schoolAId = '';
  let schoolBId = '';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org`,
        name: `Dashboard Widgets Security Org ${suffix}`,
      },
      select: { id: true },
    });
    organizationId = organization.id;

    const [schoolA, schoolB] = await Promise.all([
      prisma.school.create({
        data: {
          organizationId,
          slug: `${marker}-school-a`,
          name: `Dashboard Widgets School A ${suffix}`,
        },
        select: { id: true },
      }),
      prisma.school.create({
        data: {
          organizationId,
          slug: `${marker}-school-b`,
          name: `Dashboard Widgets School B ${suffix}`,
        },
        select: { id: true },
      }),
    ]);
    schoolAId = schoolA.id;
    schoolBId = schoolB.id;

    await prisma.student.createMany({
      data: [
        {
          organizationId,
          schoolId: schoolAId,
          firstName: `${marker} A`,
          lastName: 'Student 1',
        },
        {
          organizationId,
          schoolId: schoolBId,
          firstName: `${marker} B`,
          lastName: 'Student 1',
        },
        {
          organizationId,
          schoolId: schoolBId,
          firstName: `${marker} B`,
          lastName: 'Student 2',
        },
        {
          organizationId,
          schoolId: schoolBId,
          firstName: `${marker} B`,
          lastName: 'Student 3',
        },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;

    await prisma.student.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.organization.deleteMany({
      where: { id: organizationId },
    });
    await prisma.$disconnect();
  });

  it('registers widget routes with dashboard.widgets.view and no write methods', () => {
    expect(controllerMethods(DashboardController)).toEqual([
      'getCommandCenter',
      'getLightModeDropdown',
      'getAnalyticsCatalog',
      'listAnalyticsCharts',
      'getAnalyticsChart',
      'getAnalyticsChartData',
      'listModules',
      'getModulePage',
      'listWidgets',
      'getWidget',
      'getSummary',
      'listAlerts',
      'listActivityFeed',
    ]);
    expect(readPermissions('getAnalyticsCatalog')).toEqual([
      'dashboard.analytics.view',
    ]);
    expect(readPermissions('listAnalyticsCharts')).toEqual([
      'dashboard.analytics.view',
    ]);
    expect(readPermissions('getAnalyticsChart')).toEqual([
      'dashboard.analytics.view',
    ]);
    expect(readPermissions('getAnalyticsChartData')).toEqual([
      'dashboard.analytics.view',
    ]);
    expect(readPermissions('listModules')).toEqual(['dashboard.modules.view']);
    expect(readPermissions('getModulePage')).toEqual([
      'dashboard.modules.view',
    ]);
    expect(readPermissions('listWidgets')).toEqual(['dashboard.widgets.view']);
    expect(readPermissions('getWidget')).toEqual(['dashboard.widgets.view']);
    expect(controllerMethods(DashboardController)).not.toEqual(
      expect.arrayContaining([
        'createWidget',
        'updateWidgetLayout',
        'saveWidgetPreference',
        'createTodo',
        'acknowledgeAlert',
        'dismissAlert',
        'snoozeAlert',
      ]),
    );
  });

  it('adds dashboard.widgets.view to admin-like seed inheritance only', () => {
    const permissionsSeed = readFileSync(
      join(process.cwd(), 'prisma/seeds/01-permissions.seed.ts'),
      'utf8',
    );
    const rolesSeed = readFileSync(
      join(process.cwd(), 'prisma/seeds/02-system-roles.seed.ts'),
      'utf8',
    );

    expect(permissionsSeed).toContain("'dashboard.widgets.view'");
    expect(permissionsSeed).toContain("'dashboard.modules.view'");
    expect(permissionsSeed).toContain("'dashboard.analytics.view'");
    expect(permissionsSeed).toContain("resource: 'widgets'");
    expect(permissionsSeed).toContain("resource: 'modules'");
    expect(permissionsSeed).toContain("resource: 'analytics'");
    expect(rolesSeed).toContain('const ALL = PERMISSION_CODES;');
    expect(rolesSeed).toContain('const NON_PLATFORM = ALL.filter');
    expect(rolesSeed).toContain('const SCHOOL_LEVEL = NON_PLATFORM;');
    expect(extractArrayLiteral(rolesSeed, 'TEACHER_PERMISSIONS')).not.toContain(
      'dashboard.modules.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'TEACHER_PERMISSIONS')).not.toContain(
      'dashboard.widgets.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'TEACHER_PERMISSIONS')).not.toContain(
      'dashboard.analytics.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'PARENT_PERMISSIONS')).not.toContain(
      'dashboard.modules.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'PARENT_PERMISSIONS')).not.toContain(
      'dashboard.widgets.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'PARENT_PERMISSIONS')).not.toContain(
      'dashboard.analytics.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'STUDENT_PERMISSIONS')).not.toContain(
      'dashboard.modules.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'STUDENT_PERMISSIONS')).not.toContain(
      'dashboard.widgets.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'STUDENT_PERMISSIONS')).not.toContain(
      'dashboard.analytics.view',
    );
  });

  it('keeps school A from observing school B widget data and ignores override-shaped input', async () => {
    const useCase = new ListDashboardWidgetsUseCase(
      new DashboardSummaryRepository(prisma),
      new DashboardAlertsRepository(prisma),
      new DashboardActivityFeedRepository(prisma),
      new DashboardTimeContextService(
        new DashboardTimeContextRepository(prisma),
      ),
    );

    const response = await withSchoolScope(schoolAId, () =>
      (useCase.execute as unknown as (query: unknown) => Promise<unknown>).call(
        useCase,
        {
          schoolId: schoolBId,
          organizationId,
          limit: 20,
        },
      ),
    );

    const body = response as {
      widgets: Array<{ widgetKey: string; data: { value?: number } }>;
    };
    expect(
      body.widgets.find((widget) => widget.widgetKey === 'students.active')
        ?.data.value,
    ).toBe(1);

    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain(`Dashboard Widgets School B ${suffix}`);
    expect(serialized).not.toContain(schoolAId);
    expect(serialized).not.toContain(schoolBId);
    expectNoInternalLeaks(response);
  });

  it('does not expose tenant or raw activity fields in the widgets presenter', () => {
    const response = presentDashboardWidgets({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      summary: {
        generatedAt: new Date('2026-07-09T12:00:00.000Z'),
        school: { name: 'School A', timezone: null, locale: null },
        academicContext: { academicYear: null, term: null },
        cards: zeroCards(),
        schoolId: 'school-a',
        organizationId: 'org-a',
      } as any,
      alertSignals: {
        generatedAt: new Date('2026-07-09T12:00:00.000Z'),
        academicContext: { academicYear: null, term: null },
        admissions: {
          applicationsWaitingDecision: 0,
          testsPending: 0,
          interviewsPending: 0,
        },
        academics: {
          missingActiveAcademicYear: 1,
          missingActiveTerm: 1,
          draftTimetableEntries: 0,
          lessonPlansPendingActivation: 0,
        },
        attendance: {
          todaySessionsPendingSubmission: 0,
          todayAbsentEntries: 0,
          todayLateEntries: 0,
          pendingExcuses: 0,
        },
        grades: {
          draftAssessments: 0,
          publishedAssessmentsPendingApproval: 0,
          pendingSubmissions: 0,
          pendingAnswerReviews: 0,
        },
        homework: {
          submissionsWaitingReview: 0,
          gradedAssignmentsMissingSyncLink: 0,
          pastDueMissingSubmissions: 0,
        },
        behavior: {
          pendingReviews: 0,
          recentNegativeRecords: 0,
        },
        reinforcement: {
          pendingReviews: 0,
          overdueActiveTasks: 0,
        },
        communication: {
          pendingModerationReports: 0,
          activeAnnouncementsExpiringSoon: 0,
        },
        settings: {
          missingLoginIdentity: 1,
          missingActiveEmailConnection: 1,
        },
        schoolId: 'school-a',
      } as any,
      activityItems: [
        {
          activityId: 'audit:activity-1',
          source: 'homework',
          eventType: 'homework.submission.review',
          title: 'Homework reviewed',
          description: 'A homework submission was reviewed.',
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
          occurredAt: '2026-07-09T11:00:00.000Z',
          schoolId: 'school-a',
          organizationId: 'org-a',
          raw: { resourceId: 'submission-1' },
        } as any,
      ],
      filters: { limit: 20 },
    });

    expectNoInternalLeaks(response);
  });

  async function withSchoolScope<T>(
    schoolId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: `actor-${schoolId}`, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: `membership-${schoolId}`,
        organizationId,
        schoolId,
        roleId: `role-${schoolId}`,
        permissions: ['dashboard.widgets.view'],
      });

      return fn();
    });
  }
});

function readPermissions(methodName: string): string[] | undefined {
  return Reflect.getMetadata(
    REQUIRED_PERMISSIONS_METADATA,
    DashboardController.prototype[methodName],
  );
}

function controllerMethods(controller: Function): string[] {
  return Object.getOwnPropertyNames(controller.prototype).filter(
    (method) => method !== 'constructor',
  );
}

function extractArrayLiteral(source: string, arrayName: string): string {
  const match = source.match(
    new RegExp(`const ${arrayName} = \\[([\\s\\S]*?)\\];`),
  );
  return match?.[1] ?? '';
}

function expectNoInternalLeaks(body: unknown): void {
  const serialized = JSON.stringify(body);
  for (const forbidden of [
    'schoolId',
    'organizationId',
    'membershipId',
    'roleId',
    'passwordHash',
    'deletedAt',
    'actorId',
    'resourceId',
    'actor-1',
    'submission-1',
    'bucket',
    'objectKey',
    'raw',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

function zeroCards() {
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
