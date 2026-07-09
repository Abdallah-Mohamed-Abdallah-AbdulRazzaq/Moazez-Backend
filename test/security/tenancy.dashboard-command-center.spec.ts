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
import { GetDashboardCommandCenterUseCase } from '../../src/modules/dashboard/application/get-dashboard-command-center.use-case';
import { DashboardController } from '../../src/modules/dashboard/controller/dashboard.controller';
import { DashboardActivityFeedRepository } from '../../src/modules/dashboard/infrastructure/dashboard-activity-feed.repository';
import { DashboardAlertsRepository } from '../../src/modules/dashboard/infrastructure/dashboard-alerts.repository';
import { DashboardSummaryRepository } from '../../src/modules/dashboard/infrastructure/dashboard-summary.repository';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';

jest.setTimeout(60000);

describe('Dashboard command center tenancy/security contracts', () => {
  const suffix = randomUUID().split('-')[0];
  const marker = `dcc-security-${suffix}`;

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

  it('registers only read-only dashboard controller methods with explicit permissions', () => {
    expect(controllerMethods(DashboardController)).toEqual([
      'getCommandCenter',
      'getSummary',
      'listAlerts',
      'listActivityFeed',
    ]);
    expect(readPermissions('getCommandCenter')).toEqual([
      'dashboard.command_center.view',
    ]);
    expect(readPermissions('getSummary')).toEqual(['dashboard.summary.view']);
    expect(readPermissions('listAlerts')).toEqual(['dashboard.alerts.view']);
    expect(readPermissions('listActivityFeed')).toEqual([
      'dashboard.activity_feed.view',
    ]);
    expect(controllerMethods(DashboardController)).not.toEqual(
      expect.arrayContaining([
        'listWidgets',
        'getWidget',
        'listAnalyticsCatalog',
        'listAnalyticsCharts',
        'getLightModeDropdown',
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
    expect(permissionsSeed).toContain("resource: 'command_center'");
    expect(rolesSeed).toContain('const ALL = PERMISSION_CODES;');
    expect(rolesSeed).toContain('const SCHOOL_LEVEL = NON_PLATFORM;');
    expect(extractArrayLiteral(rolesSeed, 'TEACHER_PERMISSIONS')).not.toContain(
      'dashboard.command_center.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'PARENT_PERMISSIONS')).not.toContain(
      'dashboard.command_center.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'STUDENT_PERMISSIONS')).not.toContain(
      'dashboard.command_center.view',
    );
  });

  it('keeps school A from observing school B command center data and ignores override-shaped input', async () => {
    const useCase = new GetDashboardCommandCenterUseCase(
      new DashboardSummaryRepository(prisma),
      new DashboardAlertsRepository(prisma),
      new DashboardActivityFeedRepository(prisma),
    );

    const response = await withSchoolScope(schoolAId, () =>
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

    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain(`Command Center School B ${suffix}`);
    expect(serialized).not.toContain(schoolAId);
    expect(serialized).not.toContain(schoolBId);
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
    'bucket',
    'objectKey',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}
