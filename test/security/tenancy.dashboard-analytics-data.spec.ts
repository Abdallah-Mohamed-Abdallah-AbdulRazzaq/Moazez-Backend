import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SchoolLoginSettingsStatus, UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { GetDashboardAnalyticsChartDataUseCase } from '../../src/modules/dashboard/application/get-dashboard-analytics-chart-data.use-case';
import { DashboardController } from '../../src/modules/dashboard/controller/dashboard.controller';
import { DashboardTimeContextService } from '../../src/modules/dashboard/application/dashboard-time-context.service';
import { DashboardTimeContextRepository } from '../../src/modules/dashboard/infrastructure/dashboard-time-context.repository';
import { DashboardAnalyticsQueryContextService } from '../../src/modules/dashboard/application/dashboard-analytics-query-context.service';
import { DashboardAnalyticsHierarchyRepository } from '../../src/modules/dashboard/infrastructure/dashboard-analytics-hierarchy.repository';
import { DashboardAnalyticsSnapshotRepository } from '../../src/modules/dashboard/infrastructure/dashboard-analytics-snapshot.repository';

jest.setTimeout(60000);

describe('Dashboard analytics data tenancy/security contracts', () => {
  const suffix = randomUUID().split('-')[0];
  const marker = `analytics-data-security-${suffix}`;

  let prisma: PrismaService;
  let organizationId = '';
  let schoolAId = '';
  let schoolBId = '';
  let schoolBAcademicYearId = '';
  let schoolBTermId = '';
  let schoolBGradeId = '';
  let schoolBSectionId = '';
  let schoolBClassroomId = '';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org`,
        name: `Dashboard Analytics Data Security Org ${suffix}`,
      },
      select: { id: true },
    });
    organizationId = organization.id;

    const [schoolA, schoolB] = await Promise.all([
      prisma.school.create({
        data: {
          organizationId,
          slug: `${marker}-school-a`,
          name: `Dashboard Analytics Data School A ${suffix}`,
        },
        select: { id: true },
      }),
      prisma.school.create({
        data: {
          organizationId,
          slug: `${marker}-school-b`,
          name: `Dashboard Analytics Data School B ${suffix}`,
        },
        select: { id: true },
      }),
    ]);
    schoolAId = schoolA.id;
    schoolBId = schoolB.id;

    await prisma.schoolLoginSettings.create({
      data: {
        schoolId: schoolBId,
        loginDomain: `${marker}-school-b.moazez.test`,
        status: SchoolLoginSettingsStatus.ACTIVE,
      },
    });

    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId: schoolBId,
        nameAr: `${marker}-year-ar`,
        nameEn: `${marker}-year-en`,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
      },
      select: { id: true },
    });
    schoolBAcademicYearId = academicYear.id;
    const term = await prisma.term.create({
      data: {
        schoolId: schoolBId,
        academicYearId: academicYear.id,
        nameAr: `${marker}-term-ar`,
        nameEn: `${marker}-term-en`,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
      },
      select: { id: true },
    });
    schoolBTermId = term.id;
    const stage = await prisma.stage.create({
      data: {
        schoolId: schoolBId,
        nameAr: `${marker}-stage-ar`,
        nameEn: `${marker}-stage-en`,
      },
      select: { id: true },
    });
    const grade = await prisma.grade.create({
      data: {
        schoolId: schoolBId,
        stageId: stage.id,
        nameAr: `${marker}-grade-ar`,
        nameEn: `${marker}-grade-en`,
      },
      select: { id: true },
    });
    schoolBGradeId = grade.id;
    const section = await prisma.section.create({
      data: {
        schoolId: schoolBId,
        gradeId: grade.id,
        nameAr: `${marker}-section-ar`,
        nameEn: `${marker}-section-en`,
      },
      select: { id: true },
    });
    schoolBSectionId = section.id;
    const classroom = await prisma.classroom.create({
      data: {
        schoolId: schoolBId,
        sectionId: section.id,
        nameAr: `${marker}-classroom-ar`,
        nameEn: `${marker}-classroom-en`,
      },
      select: { id: true },
    });
    schoolBClassroomId = classroom.id;
  });

  afterAll(async () => {
    if (!prisma) return;

    await prisma.classroom.deleteMany({ where: { schoolId: schoolBId } });
    await prisma.section.deleteMany({ where: { schoolId: schoolBId } });
    await prisma.grade.deleteMany({ where: { schoolId: schoolBId } });
    await prisma.stage.deleteMany({ where: { schoolId: schoolBId } });
    await prisma.term.deleteMany({ where: { schoolId: schoolBId } });
    await prisma.academicYear.deleteMany({ where: { schoolId: schoolBId } });
    await prisma.schoolLoginSettings.deleteMany({
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

  it('registers analytics data route with dashboard.analytics.view and no write methods', () => {
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
    expect(controllerMethods(DashboardController)).not.toEqual(
      expect.arrayContaining([
        'createAnalyticsChart',
        'saveDashboard',
        'createDashboardReport',
        'getDashboardModulePage',
        'createTodo',
        'acknowledgeAlert',
        'dismissAlert',
        'snoozeAlert',
        'subscribeRealtime',
        'exportAnalytics',
      ]),
    );
  });

  it('does not introduce a new dashboard permission', () => {
    const permissionsSeed = readFileSync(
      join(process.cwd(), 'prisma/seeds/01-permissions.seed.ts'),
      'utf8',
    );
    const rolesSeed = readFileSync(
      join(process.cwd(), 'prisma/seeds/02-system-roles.seed.ts'),
      'utf8',
    );

    expect(permissionsSeed).toContain("'dashboard.analytics.view'");
    expect(permissionsSeed).not.toContain('dashboard.analytics.data.view');
    expect(rolesSeed).toContain('const ALL = PERMISSION_CODES;');
    expect(rolesSeed).toContain('const NON_PLATFORM = ALL.filter');
    expect(rolesSeed).toContain('const SCHOOL_LEVEL = NON_PLATFORM;');
    expect(extractArrayLiteral(rolesSeed, 'TEACHER_PERMISSIONS')).not.toContain(
      'dashboard.analytics.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'PARENT_PERMISSIONS')).not.toContain(
      'dashboard.analytics.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'STUDENT_PERMISSIONS')).not.toContain(
      'dashboard.analytics.view',
    );
  });

  it('keeps school A from observing school B analytics readiness and ignores override-shaped input', async () => {
    const useCase = analyticsDataUseCase();

    const schoolAResponse = await withSchoolScope(schoolAId, () =>
      useCase.execute('settings.login_identity_readiness', {
        schoolId: schoolBId,
        organizationId,
      } as any),
    );
    const schoolBResponse = await withSchoolScope(schoolBId, () =>
      useCase.execute('settings.login_identity_readiness', {}),
    );

    expect(schoolAResponse).toMatchObject({
      chartKey: 'settings.login_identity_readiness',
      status: 'available',
      data: {
        totals: { ready: 0, missing: 1 },
        summary: { value: 0 },
      },
    });
    expect(schoolBResponse).toMatchObject({
      chartKey: 'settings.login_identity_readiness',
      status: 'available',
      data: {
        totals: { ready: 1, missing: 0 },
        summary: { value: 100 },
      },
    });

    expect(JSON.stringify(schoolAResponse)).not.toContain(schoolAId);
    expect(JSON.stringify(schoolAResponse)).not.toContain(schoolBId);
    expectNoInternalLeaks(schoolAResponse);
  });

  it('returns only safe public metadata for known unsupported charts', async () => {
    const useCase = analyticsDataUseCase();

    const response = await withSchoolScope(schoolAId, () =>
      useCase.execute('attendance.daily_trend', {}),
    );

    expect(response).toMatchObject({
      chartKey: 'attendance.daily_trend',
      source: 'attendance',
      title: 'Daily attendance trend',
      status: 'planned',
      data: {
        series: [],
        totals: {},
        summary: null,
        empty: true,
      },
      meta: {
        pack: null,
        dataAvailability: 'definition_only',
      },
    });
    expect(JSON.stringify(response)).not.toContain('sourceModels');
    expectNoInternalLeaks(response);
  });

  it('does not resolve any School B hierarchy identifier from School A', async () => {
    const useCase = analyticsDataUseCase();
    const crossSchoolFilters = [
      { academicYearId: schoolBAcademicYearId },
      { termId: schoolBTermId },
      { gradeId: schoolBGradeId },
      { sectionId: schoolBSectionId },
      { classroomId: schoolBClassroomId },
    ];

    for (const filters of crossSchoolFilters) {
      const error = await withSchoolScope(schoolAId, () =>
        useCase
          .execute('attendance.pending_sessions', filters)
          .then(() => null)
          .catch((caught: unknown) => caught),
      );

      expect(error).toMatchObject({
        code: 'not_found',
        message: 'Dashboard analytics hierarchy was not found',
        details: undefined,
      });
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain(Object.values(filters)[0]);
      expect(serialized).not.toContain(schoolAId);
      expect(serialized).not.toContain(schoolBId);
    }
  });

  function analyticsDataUseCase(): GetDashboardAnalyticsChartDataUseCase {
    const timeContextService = new DashboardTimeContextService(
      new DashboardTimeContextRepository(prisma),
    );
    return new GetDashboardAnalyticsChartDataUseCase(
      new DashboardAnalyticsQueryContextService(
        timeContextService,
        new DashboardAnalyticsHierarchyRepository(prisma),
      ),
      new DashboardAnalyticsSnapshotRepository(prisma),
    );
  }

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
        permissions: ['dashboard.analytics.view'],
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
    'userId',
    'resourceId',
    'bucket',
    'objectKey',
    'platform_admin',
    'platform-admin',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
  expect(serialized).not.toMatch(/(^|[^A-Za-z0-9])raw([^A-Za-z0-9]|$)/i);
}
