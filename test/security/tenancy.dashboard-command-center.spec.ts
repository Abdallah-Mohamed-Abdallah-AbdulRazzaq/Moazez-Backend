import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StudentEnrollmentStatus, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { GetDashboardCommandCenterUseCase } from '../../src/modules/dashboard/application/get-dashboard-command-center.use-case';
import { DashboardController } from '../../src/modules/dashboard/controller/dashboard.controller';
import { DashboardActivityFeedRepository } from '../../src/modules/dashboard/infrastructure/dashboard-activity-feed.repository';
import { DashboardAlertsRepository } from '../../src/modules/dashboard/infrastructure/dashboard-alerts.repository';
import { DashboardSummaryRepository } from '../../src/modules/dashboard/infrastructure/dashboard-summary.repository';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { DashboardTimeContextService } from '../../src/modules/dashboard/application/dashboard-time-context.service';
import { DashboardTimeContextRepository } from '../../src/modules/dashboard/infrastructure/dashboard-time-context.repository';
import { DashboardWidgetCompositionService } from '../../src/modules/dashboard/application/dashboard-widget-composition.service';
import { DashboardTodosRepository } from '../../src/modules/dashboard/infrastructure/dashboard-todos.repository';
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

jest.setTimeout(60000);

describe('Dashboard command center tenancy/security contracts', () => {
  const suffix = randomUUID().split('-')[0];
  const marker = `dcc-security-${suffix}`;

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
        name: `Command Center Security Org ${suffix}`,
      },
      select: { id: true },
    });
    organizationId = organization.id;

    const [schoolA, schoolB] = await Promise.all([
      prisma.school.create({
        data: {
          organizationId,
          slug: `${marker}-school-a`,
          name: `Command Center School A ${suffix}`,
        },
        select: { id: true },
      }),
      prisma.school.create({
        data: {
          organizationId,
          slug: `${marker}-school-b`,
          name: `Command Center School B ${suffix}`,
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
            firstName: 'Command',
            lastName: label,
            userType: UserType.SCHOOL_USER,
          },
          select: { id: true },
        }),
      ),
    );
    [ownerAId, ownerBId, ownerSchoolBId] = owners.map((owner) => owner.id);
    const todoDate = new Date(
      `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
    );
    await prisma.dashboardTodo.createMany({
      data: [
        {
          schoolId: schoolAId,
          ownerUserId: ownerAId,
          date: todoDate,
          title: `${marker} owner A todo`,
        },
        {
          schoolId: schoolAId,
          ownerUserId: ownerBId,
          date: todoDate,
          title: `${marker} owner B private todo`,
        },
        {
          schoolId: schoolBId,
          ownerUserId: ownerSchoolBId,
          date: todoDate,
          title: `${marker} school B private todo`,
        },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;

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

  it('registers only read-only dashboard controller methods with explicit permissions', () => {
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
    expect(readPermissions('getCommandCenter')).toEqual([
      'dashboard.command_center.view',
    ]);
    expect(readPermissions('getLightModeDropdown')).toEqual([
      'dashboard.light_mode_dropdown.view',
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
    expect(readPermissions('getSummary')).toEqual(['dashboard.summary.view']);
    expect(readPermissions('listAlerts')).toEqual(['dashboard.alerts.view']);
    expect(readPermissions('listActivityFeed')).toEqual([
      'dashboard.activity_feed.view',
    ]);
    expect(controllerMethods(DashboardController)).not.toEqual(
      expect.arrayContaining([
        'createTodo',
        'acknowledgeAlert',
        'dismissAlert',
        'snoozeAlert',
      ]),
    );
  });

  it('adds dashboard.command_center.view to admin-like seed inheritance only', () => {
    const permissionsSeed = readFileSync(
      join(process.cwd(), 'prisma/seeds/01-permissions.seed.ts'),
      'utf8',
    );
    const rolesSeed = readFileSync(
      join(process.cwd(), 'prisma/seeds/02-system-roles.seed.ts'),
      'utf8',
    );

    expect(permissionsSeed).toContain("'dashboard.command_center.view'");
    expect(permissionsSeed).toContain("'dashboard.analytics.view'");
    expect(permissionsSeed).toContain("'dashboard.widgets.view'");
    expect(permissionsSeed).toContain("resource: 'command_center'");
    expect(permissionsSeed).toContain("resource: 'analytics'");
    expect(permissionsSeed).toContain("resource: 'widgets'");
    expect(rolesSeed).toContain('const ALL = PERMISSION_CODES;');
    expect(rolesSeed).toContain('const SCHOOL_LEVEL = NON_PLATFORM;');
    expect(extractArrayLiteral(rolesSeed, 'TEACHER_PERMISSIONS')).not.toContain(
      'dashboard.command_center.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'TEACHER_PERMISSIONS')).not.toContain(
      'dashboard.widgets.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'TEACHER_PERMISSIONS')).not.toContain(
      'dashboard.analytics.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'PARENT_PERMISSIONS')).not.toContain(
      'dashboard.command_center.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'PARENT_PERMISSIONS')).not.toContain(
      'dashboard.widgets.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'PARENT_PERMISSIONS')).not.toContain(
      'dashboard.analytics.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'STUDENT_PERMISSIONS')).not.toContain(
      'dashboard.command_center.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'STUDENT_PERMISSIONS')).not.toContain(
      'dashboard.widgets.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'STUDENT_PERMISSIONS')).not.toContain(
      'dashboard.analytics.view',
    );
  });

  it('keeps school A from observing school B command center data and ignores override-shaped input', async () => {
    const analyticsUseCase = analyticsDataUseCase(prisma);
    const plannerCalendarRepository = new DashboardPlannerCalendarRepository(
      prisma,
    );
    const calendarSpy = jest.spyOn(
      plannerCalendarRepository,
      'listSchoolEvents',
    );
    const compositionService = new DashboardWidgetCompositionService(
      new DashboardSummaryRepository(prisma),
      new DashboardAlertsRepository(prisma),
      new DashboardActivityFeedRepository(prisma),
      new DashboardTodosRepository(prisma),
      analyticsUseCase,
      plannerCalendarRepository,
    );
    const useCase = new GetDashboardCommandCenterUseCase(
      new DashboardSummaryRepository(prisma),
      new DashboardAlertsRepository(prisma),
      new DashboardActivityFeedRepository(prisma),
      new DashboardTimeContextService(
        new DashboardTimeContextRepository(prisma),
      ),
      compositionService,
    );

    const response = await withSchoolScope(schoolAId, ownerAId, () =>
      (useCase.execute as unknown as (input: unknown) => Promise<unknown>).call(
        useCase,
        {
          schoolId: schoolBId,
          organizationId,
        },
      ),
    );

    expect(response).toMatchObject({
      school: {
        name: `Command Center School A ${suffix}`,
      },
    });
    const body = response as {
      quickStats: Array<{ key: string; value: number }>;
    };
    expect(
      body.quickStats.find((stat) => stat.key === 'students.active')?.value,
    ).toBe(1);

    const commandCenter = response as {
      analyticsPreview: Array<{
        chartKey: string;
        totals: Record<string, number>;
      }>;
      todoPreview: { items: Array<{ title: string }> };
    };
    expect(
      commandCenter.analyticsPreview.map((preview) => preview.chartKey),
    ).toEqual([
      'students.enrollment_growth',
      'attendance.daily_trend',
      'communication.message_volume',
    ]);
    const enrollmentGrowth = commandCenter.analyticsPreview.find(
      (preview) => preview.chartKey === 'students.enrollment_growth',
    );
    expect(enrollmentGrowth?.totals.active_enrollments).toBe(1);
    expect(enrollmentGrowth?.totals.active_enrollments).not.toBe(3);
    expect(commandCenter.todoPreview.items).toEqual([
      expect.objectContaining({ title: `${marker} owner A todo` }),
    ]);

    const serialized = JSON.stringify(response);
    expect(calendarSpy).not.toHaveBeenCalled();
    expect(serialized).not.toContain(`Command Center School B ${suffix}`);
    expect(serialized).not.toContain(`${marker} owner B private todo`);
    expect(serialized).not.toContain(`${marker} school B private todo`);
    expect(serialized).not.toContain(schoolAId);
    expect(serialized).not.toContain(schoolBId);
    expectNoInternalLeaks(response);
  });

  async function withSchoolScope<T>(
    schoolId: string,
    actorId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: actorId, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: `membership-${schoolId}`,
        organizationId,
        schoolId,
        roleId: `role-${schoolId}`,
        permissions: ['dashboard.command_center.view'],
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
    'ownerUserId',
    'todoId',
    'notes',
    'raw',
    'queryRaw',
    'deletedAt',
    'bucket',
    'objectKey',
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
