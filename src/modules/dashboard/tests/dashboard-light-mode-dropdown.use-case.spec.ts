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
import { DashboardTodosRepository } from '../infrastructure/dashboard-todos.repository';
import { DashboardPlannerCalendarRepository } from '../infrastructure/dashboard-planner-calendar.repository';
import { DashboardPlannerItemsRepository } from '../infrastructure/dashboard-planner-items.repository';

describe('Dashboard LightModeDropdown use case', () => {
  it('returns a stable response shape from the active school profile', async () => {
    const repository = repositoryMock(locationSnapshot());
    const todosRepository = todosRepositoryMock();
    const useCase = new GetDashboardLightModeDropdownUseCase(
      repository as any,
      todosRepository as any,
      calendarRepositoryMock() as any,
      plannerItemsRepositoryMock() as any,
    );

    const response = await withSchoolScope(() => useCase.execute());

    expect(repository.loadSchoolLocationSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        organizationId: 'org-1',
        schoolId: 'school-1',
        roleId: 'role-1',
      }),
    );
    expect(todosRepository.listOwnedTodos).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1', actorId: 'user-1' }),
      expect.objectContaining({ limit: 100 }),
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
        plannerStatus: 'cross_module_available',
        todosStatus: 'persisted',
        deferred: {
          weatherProvider: 'deferred',
          weatherCache: 'deferred',
          todoPersistence: 'persisted',
          plannerCalendar: 'available',
          crossModulePlannerItems: 'available',
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
    const useCase = new GetDashboardLightModeDropdownUseCase(
      repository as any,
      todosRepositoryMock() as any,
      calendarRepositoryMock() as any,
      plannerItemsRepositoryMock() as any,
    );

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
    const useCase = new GetDashboardLightModeDropdownUseCase(
      repository as any,
      todosRepositoryMock() as any,
      calendarRepositoryMock() as any,
      plannerItemsRepositoryMock() as any,
    );

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
      plannerCalendar: 'available',
      todoPersistence: 'persisted',
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
      todosRepositoryMock() as any,
      calendarRepositoryMock() as any,
      plannerItemsRepositoryMock() as any,
    );

    await expect(
      runWithRequestContext(createRequestContext(), async () => {
        setActor({ id: 'platform-user', userType: UserType.PLATFORM_USER });
        return useCase.execute();
      }),
    ).rejects.toBeInstanceOf(ScopeMissingException);
  });

  it('includes persisted current-owner todos for the resolved date', async () => {
    const todosRepository = todosRepositoryMock();
    todosRepository.listOwnedTodos.mockResolvedValue([
      {
        id: 'todo-1',
        date: new Date('2026-07-09T00:00:00.000Z'),
        title: 'Review attendance',
        notes: null,
        status: 'PENDING',
        priority: 'NORMAL',
        sortOrder: 0,
        completedAt: null,
        createdAt: new Date('2026-07-09T10:00:00.000Z'),
        updatedAt: new Date('2026-07-09T10:00:00.000Z'),
      } as any,
    ]);
    const useCase = new GetDashboardLightModeDropdownUseCase(
      repositoryMock(locationSnapshot()) as any,
      todosRepository as any,
      calendarRepositoryMock() as any,
      plannerItemsRepositoryMock() as any,
    );

    const response = await withSchoolScope(() =>
      useCase.execute({ date: '2026-07-09' }),
    );

    expect(response.planner.todos).toEqual([
      expect.objectContaining({
        todoId: 'todo-1',
        title: 'Review attendance',
        status: 'pending',
      }),
    ]);
    expect(response.meta.todosStatus).toBe('persisted');
  });

  it('normalizes the selected date and timezone before loading Calendar and Todos in parallel', async () => {
    const todosRepository = todosRepositoryMock();
    const calendarRepository = calendarRepositoryMock();
    const plannerItemsRepository = plannerItemsRepositoryMock();
    const pending: Array<() => void> = [];
    todosRepository.listOwnedTodos.mockImplementation(
      () => new Promise((resolve) => pending.push(() => resolve([]))),
    );
    calendarRepository.listSchoolEvents.mockImplementation(
      () => new Promise((resolve) => pending.push(() => resolve([]))),
    );
    plannerItemsRepository.listSchoolItems.mockImplementation(
      () => new Promise((resolve) => pending.push(() => resolve([]))),
    );
    const useCase = new GetDashboardLightModeDropdownUseCase(
      repositoryMock(locationSnapshot()) as any,
      todosRepository as any,
      calendarRepository as any,
      plannerItemsRepository as any,
    );

    const result = withSchoolScope(() =>
      useCase.execute({
        date: '2026-04-24',
        timezone: 'Africa/Cairo',
      }),
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(pending).toHaveLength(3);
    expect(todosRepository.listOwnedTodos).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1', actorId: 'user-1' }),
      { date: new Date('2026-04-24T00:00:00.000Z'), limit: 100 },
    );
    expect(calendarRepository.listSchoolEvents).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1', actorId: 'user-1' }),
      {
        from: new Date('2026-04-23T22:00:00.000Z'),
        toExclusive: new Date('2026-04-24T21:00:00.000Z'),
        allDayFrom: new Date('2026-04-24T00:00:00.000Z'),
        allDayToExclusive: new Date('2026-04-25T00:00:00.000Z'),
        limit: 100,
      },
    );
    expect(plannerItemsRepository.listSchoolItems).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1', actorId: 'user-1' }),
      {
        from: new Date('2026-04-23T22:00:00.000Z'),
        toExclusive: new Date('2026-04-24T21:00:00.000Z'),
        allDayFrom: new Date('2026-04-24T00:00:00.000Z'),
        allDayToExclusive: new Date('2026-04-25T00:00:00.000Z'),
        limit: 100,
      },
    );
    pending.forEach((resolve) => resolve());
    await expect(result).resolves.toMatchObject({
      planner: { date: '2026-04-24', timezone: 'Africa/Cairo' },
    });
  });

  it('uses the normalized school timezone fallback and propagates Calendar errors', async () => {
    const calendarRepository = calendarRepositoryMock();
    const failure = new Error('calendar unavailable');
    calendarRepository.listSchoolEvents.mockRejectedValue(failure);
    const useCase = new GetDashboardLightModeDropdownUseCase(
      repositoryMock(locationSnapshot()) as any,
      todosRepositoryMock() as any,
      calendarRepository as any,
      plannerItemsRepositoryMock() as any,
    );

    await expect(
      withSchoolScope(() => useCase.execute({ date: '2026-07-09' })),
    ).rejects.toBe(failure);
    expect(calendarRepository.listSchoolEvents).toHaveBeenCalledTimes(1);
  });

  it('uses logical UTC all-day bounds independently from negative-offset timed bounds', async () => {
    const calendarRepository = calendarRepositoryMock();
    const useCase = new GetDashboardLightModeDropdownUseCase(
      repositoryMock(locationSnapshot()) as any,
      todosRepositoryMock() as any,
      calendarRepository as any,
      plannerItemsRepositoryMock() as any,
    );

    await withSchoolScope(() =>
      useCase.execute({
        date: '2026-07-09',
        timezone: 'America/Los_Angeles',
      }),
    );

    expect(calendarRepository.listSchoolEvents).toHaveBeenCalledTimes(1);
    expect(calendarRepository.listSchoolEvents).toHaveBeenCalledWith(
      expect.objectContaining({ schoolId: 'school-1', actorId: 'user-1' }),
      {
        from: new Date('2026-07-09T07:00:00.000Z'),
        toExclusive: new Date('2026-07-10T07:00:00.000Z'),
        allDayFrom: new Date('2026-07-09T00:00:00.000Z'),
        allDayToExclusive: new Date('2026-07-10T00:00:00.000Z'),
        limit: 100,
      },
    );
  });

  it('propagates Planner Items infrastructure errors', async () => {
    const plannerItemsRepository = plannerItemsRepositoryMock();
    const failure = new Error('planner items unavailable');
    plannerItemsRepository.listSchoolItems.mockRejectedValue(failure);
    const useCase = new GetDashboardLightModeDropdownUseCase(
      repositoryMock(locationSnapshot()) as any,
      todosRepositoryMock() as any,
      calendarRepositoryMock() as any,
      plannerItemsRepository as any,
    );

    await expect(
      withSchoolScope(() => useCase.execute({ date: '2026-07-09' })),
    ).rejects.toBe(failure);
    expect(plannerItemsRepository.listSchoolItems).toHaveBeenCalledTimes(1);
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

function todosRepositoryMock(): jest.Mocked<
  Pick<DashboardTodosRepository, 'listOwnedTodos'>
> {
  return {
    listOwnedTodos: jest.fn().mockResolvedValue([]),
  };
}

function calendarRepositoryMock(): jest.Mocked<
  Pick<DashboardPlannerCalendarRepository, 'listSchoolEvents'>
> {
  return {
    listSchoolEvents: jest.fn().mockResolvedValue([]),
  };
}

function plannerItemsRepositoryMock(): jest.Mocked<
  Pick<DashboardPlannerItemsRepository, 'listSchoolItems'>
> {
  return {
    listSchoolItems: jest.fn().mockResolvedValue([]),
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
