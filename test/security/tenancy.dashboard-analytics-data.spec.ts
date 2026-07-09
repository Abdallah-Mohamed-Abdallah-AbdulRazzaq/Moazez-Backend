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
import { DashboardAlertsRepository } from '../../src/modules/dashboard/infrastructure/dashboard-alerts.repository';
import { DashboardSummaryRepository } from '../../src/modules/dashboard/infrastructure/dashboard-summary.repository';

jest.setTimeout(60000);

describe('Dashboard analytics data tenancy/security contracts', () => {
  const suffix = randomUUID().split('-')[0];
  const marker = `analytics-data-security-${suffix}`;

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
  });

  afterAll(async () => {
    if (!prisma) return;

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
    const useCase = new GetDashboardAnalyticsChartDataUseCase(
      new DashboardSummaryRepository(prisma),
      new DashboardAlertsRepository(prisma),
    );

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
    const useCase = new GetDashboardAnalyticsChartDataUseCase(
      new DashboardSummaryRepository(prisma),
      new DashboardAlertsRepository(prisma),
    );

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
