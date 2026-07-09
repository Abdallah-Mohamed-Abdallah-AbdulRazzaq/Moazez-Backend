import { UserType } from '@prisma/client';
import {
  createRequestContext,
  runWithRequestContext,
  setActiveMembership,
  setActor,
} from '../../../common/context/request-context';
import { ScopeMissingException } from '../../iam/auth/domain/auth.exceptions';
import {
  formatDateInTimezone,
  GetDashboardLightModeDropdownUseCase,
  normalizeDashboardLightModeDropdownDate,
  normalizeDashboardLightModeDropdownQuery,
  resolveDashboardLightModeDropdownTimezone,
} from '../application/get-dashboard-light-mode-dropdown.use-case';
import {
  DASHBOARD_LIGHT_MODE_DROPDOWN_ICON_KEYS,
  DashboardLightModeDropdownIconKey,
} from '../dto/dashboard-light-mode-dropdown.dto';
import {
  DashboardLightModeDropdownRepository,
  DashboardLightModeDropdownSchoolLocationSnapshot,
} from '../infrastructure/dashboard-light-mode-dropdown.repository';

describe('Dashboard LightModeDropdown use case', () => {
  it('returns a stable response shape from the active school profile', async () => {
    const repository = repositoryMock(locationSnapshot());
    const useCase = new GetDashboardLightModeDropdownUseCase(repository as any);

    const response = await withSchoolScope(() => useCase.execute());

    expect(repository.loadSchoolLocationSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
      }),
    );
    expect(response).toMatchObject({
      generatedAt: expect.any(String),
      location: {
        label: 'Cairo, Egypt',
        city: 'Cairo',
        country: 'Egypt',
        timezone: 'Africa/Cairo',
        source: 'school_profile',
      },
      weather: {
        status: 'provider_not_configured',
        provider: null,
        current: {
          temperature: null,
          lowTemperature: null,
          feelsLike: null,
          condition: 'Weather unavailable',
          iconKey: 'cloud',
          observedAt: null,
        },
      },
      hints: [],
      highlights: [],
      cities: [],
      forecast: [],
      planner: {
        timezone: 'Africa/Cairo',
        eventDates: [],
        events: [],
        todos: [],
      },
      meta: {
        source: 'dashboard_light_mode_dropdown',
        version: 'v1',
        locale: 'en',
        units: 'metric',
        weatherStatus: 'provider_not_configured',
        plannerStatus: 'foundation_only',
        todosStatus: 'not_persisted',
        deferred: {
          weatherProvider: 'deferred',
          weatherCache: 'deferred',
          todoPersistence: 'deferred',
          plannerCalendar: 'deferred',
          crossModulePlannerItems: 'deferred',
          realtime: 'deferred',
        },
      },
    });
    expect(response.planner.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expectIconKeysAreSemanticStrings(response);
    expectNoInternalLeaks(response);
  });

  it('uses valid query timezone, locale, units, and date without exposing overrides', async () => {
    const repository = repositoryMock(locationSnapshot());
    const useCase = new GetDashboardLightModeDropdownUseCase(repository as any);

    const response = await withSchoolScope(() =>
      useCase.execute({
        locale: 'ar',
        timezone: 'Europe/Berlin',
        units: 'imperial',
        date: '2026-07-10',
        schoolId: 'school-2',
        organizationId: 'org-2',
      } as any),
    );

    expect(response.location).toMatchObject({
      label: 'Cairo, Egypt',
      timezone: 'Europe/Berlin',
    });
    expect(response.planner).toMatchObject({
      timezone: 'Europe/Berlin',
      date: '2026-07-10',
      todos: [],
    });
    expect(response.meta.locale).toBe('ar');
    expect(response.meta.units).toBe('imperial');
    expectNoInternalLeaks(response);
    expect(JSON.stringify(response)).not.toContain('school-2');
    expect(JSON.stringify(response)).not.toContain('org-2');
  });

  it('falls back safely when school timezone and location are missing', async () => {
    const repository = repositoryMock({
      schoolName: 'Minimal School',
      profile: {
        timezone: null,
        formattedAddress: null,
        city: null,
        country: null,
      },
    });
    const useCase = new GetDashboardLightModeDropdownUseCase(repository as any);

    const response = await withSchoolScope(() => useCase.execute());

    expect(response.location).toEqual({
      label: null,
      city: null,
      country: null,
      timezone: 'UTC',
      source: 'school_profile',
    });
    expect(response.weather.status).toBe('location_missing');
    expect(response.weather.emptyState.reason).toBe('location_missing');
    expect(response.forecast).toEqual([]);
    expect(response.planner.events).toEqual([]);
    expect(response.planner.todos).toEqual([]);
    expect(response.meta.deferred).toMatchObject({
      weatherProvider: 'deferred',
      plannerCalendar: 'deferred',
      todoPersistence: 'deferred',
    });
  });

  it('normalizes query values defensively for direct use-case callers', () => {
    const generatedAt = new Date('2026-07-09T22:30:00.000Z');

    expect(
      normalizeDashboardLightModeDropdownQuery(
        {
          locale: 'fr',
          timezone: 'Invalid/Timezone',
          units: 'kelvin',
          date: 'invalid',
          schoolId: 'school-2',
        } as any,
        locationSnapshot(),
        generatedAt,
      ),
    ).toEqual({
      locale: 'en',
      timezone: 'Africa/Cairo',
      units: 'metric',
      date: '2026-07-10',
    });
    expect(
      resolveDashboardLightModeDropdownTimezone(undefined, 'Invalid/Timezone'),
    ).toBe('UTC');
    expect(
      normalizeDashboardLightModeDropdownDate('2026-02-30', 'UTC', generatedAt),
    ).toBe('2026-07-09');
    expect(formatDateInTimezone(generatedAt, 'Africa/Cairo')).toBe(
      '2026-07-10',
    );
  });

  it('rejects callers without an active school scope', async () => {
    const useCase = new GetDashboardLightModeDropdownUseCase(
      repositoryMock(locationSnapshot()) as any,
    );

    await expect(
      runWithRequestContext(createRequestContext(), async () => {
        setActor({ id: 'platform-user', userType: UserType.PLATFORM_USER });
        return useCase.execute();
      }),
    ).rejects.toBeInstanceOf(ScopeMissingException);
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
      permissions: ['dashboard.light_mode_dropdown.view'],
    });

    return fn();
  });
}

function repositoryMock(
  snapshot: DashboardLightModeDropdownSchoolLocationSnapshot,
): jest.Mocked<
  Pick<DashboardLightModeDropdownRepository, 'loadSchoolLocationSnapshot'>
> {
  return {
    loadSchoolLocationSnapshot: jest.fn().mockResolvedValue(snapshot),
  };
}

function locationSnapshot(): DashboardLightModeDropdownSchoolLocationSnapshot {
  return {
    schoolName: 'Moazez Academy',
    profile: {
      timezone: 'Africa/Cairo',
      formattedAddress: null,
      city: 'Cairo',
      country: 'Egypt',
    },
  };
}

function expectIconKeysAreSemanticStrings(body: unknown): void {
  const iconKeys: unknown[] = [];

  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;

    for (const [key, child] of Object.entries(value)) {
      if (key === 'iconKey') {
        iconKeys.push(child);
      }
      visit(child);
    }
  }

  visit(body);
  expect(iconKeys.length).toBeGreaterThan(0);
  expect(
    iconKeys.every(
      (iconKey): iconKey is DashboardLightModeDropdownIconKey =>
        typeof iconKey === 'string' &&
        (DASHBOARD_LIGHT_MODE_DROPDOWN_ICON_KEYS as readonly string[]).includes(
          iconKey,
        ),
    ),
  ).toBe(true);
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
    'latitude',
    'longitude',
    'providerSecret',
    'raw',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
  expect(serialized).not.toMatch(/[<][A-Za-z]+/);
}
