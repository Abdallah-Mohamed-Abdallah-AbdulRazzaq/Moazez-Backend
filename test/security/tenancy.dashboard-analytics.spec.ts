import 'reflect-metadata';
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
import { DashboardController } from '../../src/modules/dashboard/controller/dashboard.controller';
import { GetDashboardAnalyticsCatalogUseCase } from '../../src/modules/dashboard/application/get-dashboard-analytics-catalog.use-case';
import { ListDashboardAnalyticsChartsUseCase } from '../../src/modules/dashboard/application/list-dashboard-analytics-charts.use-case';

describe('Dashboard analytics tenancy/security contracts', () => {
  it('registers analytics routes with dashboard.analytics.view and no write methods', () => {
    expect(controllerMethods(DashboardController)).toEqual([
      'getCommandCenter',
      'getAnalyticsCatalog',
      'listAnalyticsCharts',
      'getAnalyticsChart',
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
    expect(controllerMethods(DashboardController)).not.toEqual(
      expect.arrayContaining([
        'createAnalyticsChart',
        'saveDashboard',
        'createDashboardReport',
        'getDashboardModulePage',
        'getLightModeDropdown',
        'createTodo',
        'acknowledgeAlert',
        'dismissAlert',
        'snoozeAlert',
        'subscribeRealtime',
      ]),
    );
  });

  it('adds dashboard.analytics.view to admin-like seed inheritance only', () => {
    const permissionsSeed = readFileSync(
      join(process.cwd(), 'prisma/seeds/01-permissions.seed.ts'),
      'utf8',
    );
    const rolesSeed = readFileSync(
      join(process.cwd(), 'prisma/seeds/02-system-roles.seed.ts'),
      'utf8',
    );

    expect(permissionsSeed).toContain("'dashboard.analytics.view'");
    expect(permissionsSeed).toContain("resource: 'analytics'");
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

  it('does not leak tenant identifiers or platform admin sources', async () => {
    const catalogUseCase = new GetDashboardAnalyticsCatalogUseCase();
    const chartsUseCase = new ListDashboardAnalyticsChartsUseCase();

    const [catalogResponse, chartsResponse] = await withSchoolScope(() =>
      Promise.all([
        catalogUseCase.execute(),
        chartsUseCase.execute({
          schoolId: 'school-b',
          organizationId: 'org-b',
          source: 'attendance',
          type: 'line',
          status: 'planned',
          limit: 20,
        } as any),
      ]),
    );

    expect(catalogResponse.catalog.sources.map((source) => source.source)).not.toContain(
      'platform',
    );
    expect(chartsResponse.filters).toEqual({
      source: 'attendance',
      type: 'line',
      status: 'planned',
      limit: 20,
    });
    expectNoInternalLeaks(catalogResponse);
    expectNoInternalLeaks(chartsResponse);
  });
});

async function withSchoolScope<T>(fn: () => T | Promise<T>): Promise<T> {
  return runWithRequestContext(createRequestContext(), async () => {
    setActor({ id: 'school-user-1', userType: UserType.SCHOOL_USER });
    setActiveMembership({
      membershipId: 'membership-1',
      organizationId: 'org-1',
      schoolId: 'school-1',
      roleId: 'role-1',
      permissions: ['dashboard.analytics.view'],
    });

    return fn();
  });
}

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
    'school-b',
    'org-b',
    'bucket',
    'objectKey',
    'platform_admin',
    'platform-admin',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
  expect(serialized).not.toMatch(/(^|[^A-Za-z0-9])raw([^A-Za-z0-9]|$)/i);
}
