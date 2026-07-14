import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AcademicCalendarEventScopeType,
  AcademicCalendarEventType,
  StudentEnrollmentStatus,
  UserType,
} from '@prisma/client';
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
import { DashboardWidgetCompositionService } from '../../src/modules/dashboard/application/dashboard-widget-composition.service';
import { DashboardTodosRepository } from '../../src/modules/dashboard/infrastructure/dashboard-todos.repository';
import {
  DASHBOARD_WIDGET_REGISTRY,
  findDashboardWidgetDefinition,
} from '../../src/modules/dashboard/domain/dashboard-widget-registry';
import { buildDashboardTimeContext } from '../../src/modules/dashboard/domain/dashboard-time-context';
import { buildDashboardWidgetRegistry } from '../../src/modules/dashboard/presenters/dashboard-widgets.presenter';
import { GetDashboardAnalyticsChartDataUseCase } from '../../src/modules/dashboard/application/get-dashboard-analytics-chart-data.use-case';
import { DashboardAnalyticsQueryContextService } from '../../src/modules/dashboard/application/dashboard-analytics-query-context.service';
import { DashboardAnalyticsHierarchyRepository } from '../../src/modules/dashboard/infrastructure/dashboard-analytics-hierarchy.repository';
import { DashboardAnalyticsSnapshotRepository } from '../../src/modules/dashboard/infrastructure/dashboard-analytics-snapshot.repository';
import { AttendanceDashboardAnalyticsRepository } from '../../src/modules/attendance/reports/infrastructure/attendance-dashboard-analytics.repository';
import { DashboardAdmissionsAnalyticsRepository } from '../../src/modules/dashboard/infrastructure/dashboard-admissions-analytics.repository';
import { DashboardStudentsAnalyticsRepository } from '../../src/modules/dashboard/infrastructure/dashboard-students-analytics.repository';
import { DashboardAcademicsAnalyticsRepository } from '../../src/modules/dashboard/infrastructure/dashboard-academics-analytics.repository';
import { DashboardGradesAnalyticsRepository } from '../../src/modules/dashboard/infrastructure/dashboard-grades-analytics.repository';
import { DashboardHomeworkAnalyticsRepository } from '../../src/modules/dashboard/infrastructure/dashboard-homework-analytics.repository';
import { DashboardBehaviorAnalyticsRepository } from '../../src/modules/dashboard/infrastructure/dashboard-behavior-analytics.repository';
import { DashboardReinforcementAnalyticsRepository } from '../../src/modules/dashboard/infrastructure/dashboard-reinforcement-analytics.repository';
import { DashboardCommunicationAnalyticsRepository } from '../../src/modules/dashboard/infrastructure/dashboard-communication-analytics.repository';
import { DashboardPlannerCalendarRepository } from '../../src/modules/dashboard/infrastructure/dashboard-planner-calendar.repository';
import { CalendarEventsController } from '../../src/modules/academics/calendar/controller/calendar-events.controller';

jest.setTimeout(60000);

describe('Dashboard widgets tenancy/security contracts', () => {
  const suffix = randomUUID().split('-')[0];
  const marker = `widgets-security-${suffix}`;

  let prisma: PrismaService;
  let organizationId = '';
  let schoolAId = '';
  let schoolBId = '';
  let ownerAId = '';
  let ownerBId = '';
  let ownerSchoolBId = '';

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

    const [schoolAContext, schoolBContext] = await Promise.all([
      createAcademicContext(prisma, schoolAId, `${marker}-a`),
      createAcademicContext(prisma, schoolBId, `${marker}-b`),
    ]);
    const students = await prisma.student.findMany({
      where: { schoolId: { in: [schoolAId, schoolBId] } },
      select: { id: true, schoolId: true },
    });
    await prisma.enrollment.createMany({
      data: students.map((student) => {
        const context =
          student.schoolId === schoolAId ? schoolAContext : schoolBContext;
        return {
          schoolId: student.schoolId,
          studentId: student.id,
          academicYearId: context.academicYearId,
          termId: context.termId,
          classroomId: context.classroomId,
          status: StudentEnrollmentStatus.ACTIVE,
          enrolledAt: new Date('2026-07-01T00:00:00.000Z'),
        };
      }),
    });

    const owners = await Promise.all(
      ['owner-a', 'owner-b', 'owner-school-b'].map((label) =>
        prisma.user.create({
          data: {
            email: `${marker}-${label}@example.test`,
            firstName: 'Widget',
            lastName: label,
            userType: UserType.SCHOOL_USER,
          },
          select: { id: true },
        }),
      ),
    );
    [ownerAId, ownerBId, ownerSchoolBId] = owners.map((owner) => owner.id);
    await prisma.dashboardTodo.createMany({
      data: [
        {
          schoolId: schoolAId,
          ownerUserId: ownerAId,
          date: new Date('2026-07-12T00:00:00.000Z'),
          title: `${marker} owner A todo`,
        },
        {
          schoolId: schoolAId,
          ownerUserId: ownerBId,
          date: new Date('2026-07-12T00:00:00.000Z'),
          title: `${marker} owner B private todo`,
        },
        {
          schoolId: schoolBId,
          ownerUserId: ownerSchoolBId,
          date: new Date('2026-07-12T00:00:00.000Z'),
          title: `${marker} school B private todo`,
        },
      ],
    });
    await prisma.academicCalendarEvent.createMany({
      data: [
        calendarEvent(
          schoolAId,
          schoolAContext.academicYearId,
          schoolAContext.termId,
          `${marker} school A calendar`,
        ),
        calendarEvent(
          schoolBId,
          schoolBContext.academicYearId,
          schoolBContext.termId,
          `${marker} school B calendar`,
        ),
        {
          ...calendarEvent(
            schoolAId,
            schoolAContext.academicYearId,
            schoolAContext.termId,
            `${marker} deleted calendar`,
          ),
          deletedAt: new Date('2026-07-01T00:00:00.000Z'),
        },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;

    await prisma.academicCalendarEvent.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.enrollment.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.student.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.dashboardTodo.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.classroom.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.section.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.grade.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.stage.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.term.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.academicYear.deleteMany({
      where: { schoolId: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.school.deleteMany({
      where: { id: { in: [schoolAId, schoolBId].filter(Boolean) } },
    });
    await prisma.organization.deleteMany({
      where: { id: organizationId },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [ownerAId, ownerBId, ownerSchoolBId].filter(Boolean) },
      },
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
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        // eslint-disable-next-line @typescript-eslint/unbound-method
        CalendarEventsController.prototype.listEvents,
      ),
    ).toEqual(['academics.calendar.view']);
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
    const compositionService = new DashboardWidgetCompositionService(
      new DashboardSummaryRepository(prisma),
      new DashboardAlertsRepository(prisma),
      new DashboardActivityFeedRepository(prisma),
      new DashboardTodosRepository(prisma),
      analyticsDataUseCase(prisma),
      new DashboardPlannerCalendarRepository(prisma),
    );
    const useCase = new ListDashboardWidgetsUseCase(
      new DashboardTimeContextService(
        new DashboardTimeContextRepository(prisma),
      ),
      compositionService,
    );

    const response = await withSchoolScope(schoolAId, () =>
      (useCase.execute as unknown as (query: unknown) => Promise<unknown>).call(
        useCase,
        {
          schoolId: schoolBId,
          organizationId,
          source: 'students',
        },
      ),
    );

    const body = response as {
      widgets: Array<{
        widgetKey: string;
        data: { value?: number; totals?: Record<string, number> };
      }>;
    };
    expect(
      body.widgets.find((widget) => widget.widgetKey === 'students.active')
        ?.data.value,
    ).toBe(1);
    const enrollmentGrowth = body.widgets.find(
      (widget) => widget.widgetKey === 'students.enrollment_growth',
    );
    expect(enrollmentGrowth?.data.totals?.active_enrollments).toBe(1);
    expect(enrollmentGrowth?.data.totals?.active_enrollments).not.toBe(3);

    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain(`Dashboard Widgets School B ${suffix}`);
    expect(serialized).not.toContain(schoolAId);
    expect(serialized).not.toContain(schoolBId);
    expectNoInternalLeaks(response);
  });

  it('isolates Todo and Calendar composition by school and owner', async () => {
    const composition = new DashboardWidgetCompositionService(
      new DashboardSummaryRepository(prisma),
      new DashboardAlertsRepository(prisma),
      new DashboardActivityFeedRepository(prisma),
      new DashboardTodosRepository(prisma),
      { execute: jest.fn() } as any,
      new DashboardPlannerCalendarRepository(prisma),
    );
    const definitions = ['todos.today', 'calendar.today'].map((key) => {
      const definition = findDashboardWidgetDefinition(key);
      if (!definition) throw new Error(`Missing widget definition: ${key}`);
      return definition;
    });

    const widgets = await withSchoolScope(
      schoolAId,
      () =>
        composition.compose({
          scope: {
            actorId: ownerAId,
            userType: UserType.SCHOOL_USER,
            organizationId,
            schoolId: schoolAId,
            roleId: `role-${schoolAId}`,
          },
          timeContext: buildDashboardTimeContext({
            generatedAt: new Date('2026-07-12T12:00:00.000Z'),
            schoolTimezone: 'UTC',
          }),
          definitions,
        }),
      ownerAId,
    );

    const serialized = JSON.stringify(widgets);
    expect(serialized).toContain(`${marker} owner A todo`);
    expect(serialized).toContain(`${marker} school A calendar`);
    expect(serialized).not.toContain(`${marker} owner B private todo`);
    expect(serialized).not.toContain(`${marker} school B private todo`);
    expect(serialized).not.toContain(`${marker} school B calendar`);
    expect(serialized).not.toContain(`${marker} deleted calendar`);
    expectNoInternalLeaks(widgets);
  });

  it('does not expose tenant or raw activity fields in the widgets presenter', () => {
    const widgets = buildDashboardWidgetRegistry({
      definitions: DASHBOARD_WIDGET_REGISTRY.slice(0, 12),
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
    });
    const response = presentDashboardWidgets({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      widgets,
      filters: { limit: 20 },
    });

    expectNoInternalLeaks(response);
  });

  async function withSchoolScope<T>(
    schoolId: string,
    fn: () => Promise<T>,
    actorId = `actor-${schoolId}`,
  ): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: actorId, userType: UserType.SCHOOL_USER });
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

function calendarEvent(
  schoolId: string,
  academicYearId: string,
  termId: string,
  title: string,
) {
  return {
    schoolId,
    academicYearId,
    termId,
    title,
    type: AcademicCalendarEventType.ACTIVITY,
    scopeType: AcademicCalendarEventScopeType.SCHOOL,
    allDay: true,
    startDate: new Date('2026-07-12T00:00:00.000Z'),
    endDate: new Date('2026-07-12T00:00:00.000Z'),
  };
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
    'ownerUserId',
    'todoId',
    'notes',
    'actor-1',
    'submission-1',
    'bucket',
    'objectKey',
    'raw',
    'queryRaw',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

async function createAcademicContext(
  prisma: PrismaService,
  schoolId: string,
  marker: string,
): Promise<{
  academicYearId: string;
  termId: string;
  classroomId: string;
}> {
  const academicYear = await prisma.academicYear.create({
    data: {
      schoolId,
      nameAr: `${marker}-year-ar`,
      nameEn: `${marker}-year-en`,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
    },
    select: { id: true },
  });
  const term = await prisma.term.create({
    data: {
      schoolId,
      academicYearId: academicYear.id,
      nameAr: `${marker}-term-ar`,
      nameEn: `${marker}-term-en`,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
    },
    select: { id: true },
  });
  const stage = await prisma.stage.create({
    data: {
      schoolId,
      nameAr: `${marker}-stage-ar`,
      nameEn: `${marker}-stage-en`,
    },
    select: { id: true },
  });
  const grade = await prisma.grade.create({
    data: {
      schoolId,
      stageId: stage.id,
      nameAr: `${marker}-grade-ar`,
      nameEn: `${marker}-grade-en`,
    },
    select: { id: true },
  });
  const section = await prisma.section.create({
    data: {
      schoolId,
      gradeId: grade.id,
      nameAr: `${marker}-section-ar`,
      nameEn: `${marker}-section-en`,
    },
    select: { id: true },
  });
  const classroom = await prisma.classroom.create({
    data: {
      schoolId,
      sectionId: section.id,
      nameAr: `${marker}-classroom-ar`,
      nameEn: `${marker}-classroom-en`,
    },
    select: { id: true },
  });

  return {
    academicYearId: academicYear.id,
    termId: term.id,
    classroomId: classroom.id,
  };
}

function analyticsDataUseCase(
  prisma: PrismaService,
): GetDashboardAnalyticsChartDataUseCase {
  const timeContextService = new DashboardTimeContextService(
    new DashboardTimeContextRepository(prisma),
  );
  return new GetDashboardAnalyticsChartDataUseCase(
    new DashboardAnalyticsQueryContextService(
      timeContextService,
      new DashboardAnalyticsHierarchyRepository(prisma),
    ),
    new DashboardAnalyticsSnapshotRepository(prisma),
    new AttendanceDashboardAnalyticsRepository(prisma),
    new DashboardAdmissionsAnalyticsRepository(prisma),
    new DashboardStudentsAnalyticsRepository(prisma),
    new DashboardAcademicsAnalyticsRepository(prisma),
    new DashboardGradesAnalyticsRepository(prisma),
    new DashboardHomeworkAnalyticsRepository(prisma),
    new DashboardBehaviorAnalyticsRepository(prisma),
    new DashboardReinforcementAnalyticsRepository(prisma),
    new DashboardCommunicationAnalyticsRepository(prisma),
  );
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
