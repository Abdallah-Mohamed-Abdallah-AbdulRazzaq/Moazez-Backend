import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AcademicCalendarEventScopeType,
  AcademicCalendarEventType,
  UserType,
} from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../src/common/context/request-context';
import { REQUIRED_PERMISSIONS_METADATA } from '../../src/common/decorators/required-permissions.decorator';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { GetDashboardLightModeDropdownUseCase } from '../../src/modules/dashboard/application/get-dashboard-light-mode-dropdown.use-case';
import { DashboardController } from '../../src/modules/dashboard/controller/dashboard.controller';
import { DashboardLightModeDropdownRepository } from '../../src/modules/dashboard/infrastructure/dashboard-light-mode-dropdown.repository';
import { DashboardTodosRepository } from '../../src/modules/dashboard/infrastructure/dashboard-todos.repository';
import { DashboardPlannerCalendarRepository } from '../../src/modules/dashboard/infrastructure/dashboard-planner-calendar.repository';
import { CalendarEventsController } from '../../src/modules/academics/calendar/controller/calendar-events.controller';
import { presentDashboardLightModeDropdown } from '../../src/modules/dashboard/presenters/dashboard-light-mode-dropdown.presenter';

jest.setTimeout(60000);

describe('Dashboard LightModeDropdown tenancy/security contracts', () => {
  const OWNER_A_ID = '33333333-3333-4333-8333-333333333333';
  const suffix = randomUUID().split('-')[0];
  const marker = `light-mode-security-${suffix}`;

  let prisma: PrismaService;
  let organizationId = '';
  let schoolAId = '';
  let schoolBId = '';
  let academicYearAId = '';
  let academicYearBId = '';
  let termAId = '';
  let termBId = '';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const organization = await prisma.organization.create({
      data: {
        slug: `${marker}-org`,
        name: `Dashboard LightMode Security Org ${suffix}`,
      },
      select: { id: true },
    });
    organizationId = organization.id;

    const [schoolA, schoolB] = await Promise.all([
      prisma.school.create({
        data: {
          organizationId,
          slug: `${marker}-school-a`,
          name: `Dashboard LightMode School A ${suffix}`,
        },
        select: { id: true },
      }),
      prisma.school.create({
        data: {
          organizationId,
          slug: `${marker}-school-b`,
          name: `Dashboard LightMode School B ${suffix}`,
        },
        select: { id: true },
      }),
    ]);
    schoolAId = schoolA.id;
    schoolBId = schoolB.id;

    await prisma.schoolProfile.createMany({
      data: [
        {
          schoolId: schoolAId,
          schoolName: `Dashboard LightMode School A ${suffix}`,
          timezone: 'Africa/Cairo',
          formattedAddress: 'School A Address',
          city: 'Cairo',
          country: 'Egypt',
          latitude: '30.044400',
          longitude: '31.235700',
        },
        {
          schoolId: schoolBId,
          schoolName: `Dashboard LightMode School B ${suffix}`,
          timezone: 'Europe/Berlin',
          formattedAddress: 'School B Address',
          city: 'Berlin',
          country: 'Germany',
          latitude: '52.520000',
          longitude: '13.405000',
        },
      ],
    });

    const [yearA, yearB] = await Promise.all(
      [schoolAId, schoolBId].map((schoolId, index) =>
        prisma.academicYear.create({
          data: {
            schoolId,
            nameAr: `${marker}-year-${index}-ar`,
            nameEn: `${marker}-year-${index}-en`,
            startDate: new Date('2026-01-01T00:00:00.000Z'),
            endDate: new Date('2026-12-31T00:00:00.000Z'),
          },
          select: { id: true },
        }),
      ),
    );
    academicYearAId = yearA.id;
    academicYearBId = yearB.id;
    const [termA, termB] = await Promise.all([
      prisma.term.create({
        data: {
          schoolId: schoolAId,
          academicYearId: academicYearAId,
          nameAr: `${marker}-term-a-ar`,
          nameEn: `${marker}-term-a-en`,
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2026-12-31T00:00:00.000Z'),
        },
        select: { id: true },
      }),
      prisma.term.create({
        data: {
          schoolId: schoolBId,
          academicYearId: academicYearBId,
          nameAr: `${marker}-term-b-ar`,
          nameEn: `${marker}-term-b-en`,
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2026-12-31T00:00:00.000Z'),
        },
        select: { id: true },
      }),
    ]);
    termAId = termA.id;
    termBId = termB.id;
    await prisma.academicCalendarEvent.createMany({
      data: [
        calendarEvent(
          schoolAId,
          academicYearAId,
          termAId,
          `${marker} School A event`,
        ),
        calendarEvent(
          schoolBId,
          academicYearBId,
          termBId,
          `${marker} School B event`,
        ),
        {
          ...calendarEvent(
            schoolAId,
            academicYearAId,
            termAId,
            `${marker} deleted event`,
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
    await prisma.term.deleteMany({
      where: { id: { in: [termAId, termBId].filter(Boolean) } },
    });
    await prisma.academicYear.deleteMany({
      where: { id: { in: [academicYearAId, academicYearBId].filter(Boolean) } },
    });
    await prisma.schoolProfile.deleteMany({
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

  it('registers the LightModeDropdown read route on the read-only Dashboard controller', () => {
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
    expect(readPermissions('getLightModeDropdown')).toEqual([
      'dashboard.light_mode_dropdown.view',
    ]);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_METADATA,
        // eslint-disable-next-line @typescript-eslint/unbound-method
        CalendarEventsController.prototype.listEvents,
      ),
    ).toEqual(['academics.calendar.view']);
    expect(controllerMethods(DashboardController)).not.toEqual(
      expect.arrayContaining([
        'refreshWeatherProvider',
        'syncPlannerCalendar',
        'acknowledgeAlert',
        'dismissAlert',
        'snoozeAlert',
        'subscribeRealtime',
        'exportDashboard',
        'createDashboardReport',
      ]),
    );
  });

  it('adds dashboard LightModeDropdown and todo permissions to admin-like seed inheritance only', () => {
    const permissionsSeed = readFileSync(
      join(process.cwd(), 'prisma/seeds/01-permissions.seed.ts'),
      'utf8',
    );
    const rolesSeed = readFileSync(
      join(process.cwd(), 'prisma/seeds/02-system-roles.seed.ts'),
      'utf8',
    );

    expect(permissionsSeed).toContain("'dashboard.light_mode_dropdown.view'");
    expect(permissionsSeed).toContain("resource: 'light_mode_dropdown'");
    expect(permissionsSeed).toContain("'dashboard.todos.view'");
    expect(permissionsSeed).toContain("'dashboard.todos.manage'");
    expect(permissionsSeed).toContain("resource: 'todos'");
    expect(rolesSeed).toContain('const ALL = PERMISSION_CODES;');
    expect(rolesSeed).toContain('const NON_PLATFORM = ALL.filter');
    expect(rolesSeed).toContain('const SCHOOL_LEVEL = NON_PLATFORM;');
    expect(extractArrayLiteral(rolesSeed, 'TEACHER_PERMISSIONS')).not.toContain(
      'dashboard.light_mode_dropdown.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'TEACHER_PERMISSIONS')).not.toContain(
      'dashboard.todos.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'TEACHER_PERMISSIONS')).not.toContain(
      'dashboard.todos.manage',
    );
    expect(extractArrayLiteral(rolesSeed, 'PARENT_PERMISSIONS')).not.toContain(
      'dashboard.light_mode_dropdown.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'PARENT_PERMISSIONS')).not.toContain(
      'dashboard.todos.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'PARENT_PERMISSIONS')).not.toContain(
      'dashboard.todos.manage',
    );
    expect(extractArrayLiteral(rolesSeed, 'STUDENT_PERMISSIONS')).not.toContain(
      'dashboard.light_mode_dropdown.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'STUDENT_PERMISSIONS')).not.toContain(
      'dashboard.todos.view',
    );
    expect(extractArrayLiteral(rolesSeed, 'STUDENT_PERMISSIONS')).not.toContain(
      'dashboard.todos.manage',
    );
  });

  it('keeps school A from observing school B Calendar/location data, hides soft deletes, and ignores tenant overrides', async () => {
    const useCase = new GetDashboardLightModeDropdownUseCase(
      new DashboardLightModeDropdownRepository(prisma),
      new DashboardTodosRepository(prisma),
      new DashboardPlannerCalendarRepository(prisma),
    );

    const response = await withSchoolScope(schoolAId, () =>
      (useCase.execute as unknown as (query: unknown) => Promise<unknown>).call(
        useCase,
        {
          schoolId: schoolBId,
          organizationId,
          ownerUserId: 'owner-b',
          date: '2026-07-09',
        },
      ),
    );
    const serialized = JSON.stringify(response);

    expect(response).toMatchObject({
      location: {
        label: 'School A Address',
        city: 'Cairo',
        country: 'Egypt',
        timezone: 'Africa/Cairo',
        source: 'school_profile',
      },
      weather: {
        status: 'provider_not_configured',
        provider: null,
      },
      forecast: [],
      planner: {
        timezone: 'Africa/Cairo',
        events: [
          expect.objectContaining({
            source: 'academic_calendar',
            title: `${marker} School A event`,
          }),
        ],
        todos: [],
      },
    });
    expect(serialized).not.toContain('School B Address');
    expect(serialized).not.toContain('Berlin');
    expect(serialized).not.toContain('Europe/Berlin');
    expect(serialized).not.toContain(schoolAId);
    expect(serialized).not.toContain(schoolBId);
    expect(serialized).not.toContain(organizationId);
    expect(serialized).not.toContain(OWNER_A_ID);
    expect(serialized).not.toContain('owner-b');
    expect(serialized).not.toContain(`${marker} School B event`);
    expect(serialized).not.toContain(`${marker} deleted event`);
    expectNoInternalLeaks(response);
  });

  it('does not expose tenant ids, latitude/longitude, provider secrets, or raw payloads in presenter output', () => {
    const response = presentDashboardLightModeDropdown({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      schoolLocation: {
        schoolName: 'School A',
        profile: {
          timezone: 'Africa/Cairo',
          formattedAddress: 'School A Address',
          city: 'Cairo',
          country: 'Egypt',
          schoolId: 'school-a',
          organizationId: 'org-a',
          latitude: '30.044400',
          longitude: '31.235700',
          raw: { providerPayload: 'secret' },
        } as any,
      },
      query: {
        locale: 'en',
        timezone: 'Africa/Cairo',
        units: 'metric',
        date: '2026-07-09',
        providerKey: 'provider-secret',
      } as any,
    });

    expect(response.weather.provider).toBeNull();
    expect(response.forecast).toEqual([]);
    expect(response.planner.todos).toEqual([]);
    expectNoInternalLeaks(response);
  });

  async function withSchoolScope<T>(
    schoolId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    return runWithRequestContext(createRequestContext(), async () => {
      setActor({ id: OWNER_A_ID, userType: UserType.SCHOOL_USER });
      setActiveMembership({
        membershipId: `membership-${schoolId}`,
        organizationId,
        schoolId,
        roleId: `role-${schoolId}`,
        permissions: ['dashboard.light_mode_dropdown.view'],
      });

      return fn();
    });
  }
});

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
    startDate: new Date('2026-07-09T00:00:00.000Z'),
    endDate: new Date('2026-07-09T00:00:00.000Z'),
  };
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
    'ownerUserId',
    'userId',
    'passwordHash',
    'deletedAt',
    'actorId',
    'resourceId',
    'bucket',
    'objectKey',
    'latitude',
    'longitude',
    'provider-secret',
    'providerPayload',
    'providerKey',
    'smtp',
    'raw',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
  expect(serialized).not.toMatch(/[<](svg|div|span)/i);
}
