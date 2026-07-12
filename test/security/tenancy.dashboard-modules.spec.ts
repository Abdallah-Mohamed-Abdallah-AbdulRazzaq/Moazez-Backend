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
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { GetDashboardModulePageUseCase } from '../../src/modules/dashboard/application/get-dashboard-module-page.use-case';
import { ListDashboardModulesUseCase } from '../../src/modules/dashboard/application/list-dashboard-modules.use-case';
import { DashboardController } from '../../src/modules/dashboard/controller/dashboard.controller';
import { findDashboardModulePageDefinition } from '../../src/modules/dashboard/domain/dashboard-module-pages';
import { DashboardAlertsRepository } from '../../src/modules/dashboard/infrastructure/dashboard-alerts.repository';
import { DashboardSummaryRepository } from '../../src/modules/dashboard/infrastructure/dashboard-summary.repository';
import {
  presentDashboardModulePage,
  presentDashboardModules,
} from '../../src/modules/dashboard/presenters/dashboard-modules.presenter';
import { buildDashboardAlerts } from '../../src/modules/dashboard/application/list-dashboard-alerts.use-case';
import { DashboardTimeContextService } from '../../src/modules/dashboard/application/dashboard-time-context.service';
import { DashboardTimeContextRepository } from '../../src/modules/dashboard/infrastructure/dashboard-time-context.repository';

jest.setTimeout(60000);

describe('Dashboard modules tenancy/security contracts', () => {
  const suffix = randomUUID().split('-')[0];
  const marker = `modules-security-${suffix}`;

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
        name: `Dashboard Modules Security Org ${suffix}`,
      },
      select: { id: true },
    });
    organizationId = organization.id;

    const [schoolA, schoolB] = await Promise.all([
      prisma.school.create({
        data: {
          organizationId,
          slug: `${marker}-school-a`,
          name: `Dashboard Modules School A ${suffix}`,
        },
        select: { id: true },
      }),
      prisma.school.create({
        data: {
          organizationId,
          slug: `${marker}-school-b`,
          name: `Dashboard Modules School B ${suffix}`,
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

  it('registers module routes with dashboard.modules.view and no write methods', () => {
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
    expect(readPermissions('listModules')).toEqual(['dashboard.modules.view']);
    expect(readPermissions('getModulePage')).toEqual([
      'dashboard.modules.view',
    ]);
    expect(controllerMethods(DashboardController)).not.toEqual(
      expect.arrayContaining([
        'createDashboardModule',
        'saveDashboardModuleLayout',
        'updateDashboardModulePreferences',
        'createTodo',
        'acknowledgeAlert',
        'dismissAlert',
        'snoozeAlert',
        'subscribeRealtime',
        'exportAnalytics',
        'createDashboardReport',
      ]),
    );
  });

  it('adds dashboard.modules.view to admin-like seed inheritance only', () => {
    const permissionsSeed = readFileSync(
      join(process.cwd(), 'prisma/seeds/01-permissions.seed.ts'),
      'utf8',
    );
    const rolesSeed = readFileSync(
      join(process.cwd(), 'prisma/seeds/02-system-roles.seed.ts'),
      'utf8',
    );

    expect(permissionsSeed).toContain("'dashboard.modules.view'");
    expect(permissionsSeed).toContain("resource: 'modules'");
    expect(rolesSeed).toContain('const ALL = PERMISSION_CODES;');
    expect(rolesSeed).toContain('const NON_PLATFORM = ALL.filter');
    expect(rolesSeed).toContain('const SCHOOL_LEVEL = NON_PLATFORM;');
    expect(extractArrayLiteral(rolesSeed, 'TEACHER_PERMISSIONS')).not.toContain(
      'dashboard.modules.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'PARENT_PERMISSIONS')).not.toContain(
      'dashboard.modules.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'STUDENT_PERMISSIONS')).not.toContain(
      'dashboard.modules.view',
    );
  });

  it('keeps school A from observing school B module data and ignores override-shaped input', async () => {
    const listUseCase = new ListDashboardModulesUseCase(
      new DashboardAlertsRepository(prisma),
      new DashboardTimeContextService(
        new DashboardTimeContextRepository(prisma),
      ),
    );
    const detailUseCase = new GetDashboardModulePageUseCase(
      new DashboardSummaryRepository(prisma),
      new DashboardAlertsRepository(prisma),
      new DashboardTimeContextService(
        new DashboardTimeContextRepository(prisma),
      ),
    );

    const listResponse = await withSchoolScope(schoolAId, () =>
      (
        listUseCase.execute as unknown as (query: unknown) => Promise<unknown>
      ).call(listUseCase, {
        schoolId: schoolBId,
        organizationId,
        source: 'students',
      }),
    );
    const detailResponse = await withSchoolScope(schoolAId, () =>
      detailUseCase.execute('students'),
    );

    expect(JSON.stringify(listResponse)).not.toContain(schoolAId);
    expect(JSON.stringify(listResponse)).not.toContain(schoolBId);
    expect(
      detailResponse.widgets.find(
        (widget) => widget.widgetKey === 'students.active',
      )?.data.value,
    ).toBe(1);
    expect(JSON.stringify(detailResponse)).not.toContain(
      `Dashboard Modules School B ${suffix}`,
    );
    expect(JSON.stringify(detailResponse)).not.toContain(schoolAId);
    expect(JSON.stringify(detailResponse)).not.toContain(schoolBId);
    expectNoInternalLeaks(listResponse);
    expectNoInternalLeaks(detailResponse);
  });

  it('does not expose tenant identifiers, platform admin, or raw fields in presenters', () => {
    const attendance = findDashboardModulePageDefinition('attendance');
    expect(attendance).toBeDefined();

    const alerts = buildDashboardAlerts(alertSignals());
    const listResponse = presentDashboardModules({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      alerts,
      filters: { limit: 20 },
      moduleDefinitions: [attendance!],
    });
    const detailResponse = presentDashboardModulePage({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      definition: attendance!,
      summary: {
        ...summarySnapshot(),
        schoolId: 'school-a',
        organizationId: 'org-a',
        raw: { actorId: 'actor-1' },
      } as any,
      alertSignals: {
        ...alertSignals(),
        membershipId: 'membership-a',
        raw: { resourceId: 'resource-1' },
      } as any,
      alerts,
    });

    expect(
      listResponse.modules.map((modulePage) => modulePage.moduleKey),
    ).not.toContain('platform-admin');
    expect(listResponse.meta.freshness).toEqual({
      dataMode: 'request_time_snapshot',
      cacheStatus: 'not_used',
      realtimeStatus: 'not_used',
    });
    expect(detailResponse.module.moduleKey).toBe('attendance');
    expectNoInternalLeaks(listResponse);
    expectNoInternalLeaks(detailResponse);
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
        permissions: ['dashboard.modules.view'],
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

function summarySnapshot() {
  return {
    generatedAt: new Date('2026-07-09T12:00:00.000Z'),
    school: { name: 'School A', timezone: null, locale: null },
    academicContext: { academicYear: null, term: null },
    cards: zeroCards(),
  };
}

function alertSignals() {
  return {
    generatedAt: new Date('2026-07-09T12:00:00.000Z'),
    academicContext: { academicYear: null, term: null },
    admissions: {
      applicationsWaitingDecision: 0,
      testsPending: 0,
      interviewsPending: 0,
    },
    academics: {
      missingActiveAcademicYear: 0,
      missingActiveTerm: 0,
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
      missingLoginIdentity: 0,
      missingActiveEmailConnection: 0,
    },
  };
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
    'userId',
    'resourceId',
    'actor-1',
    'resource-1',
    'bucket',
    'objectKey',
    'platform_admin',
    'platform-admin',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
  expect(serialized).not.toMatch(/(^|[^A-Za-z0-9])raw([^A-Za-z0-9]|$)/i);
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
