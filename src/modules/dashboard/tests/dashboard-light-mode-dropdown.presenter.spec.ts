import {
  DASHBOARD_LIGHT_MODE_DROPDOWN_ICON_KEYS,
  DashboardLightModeDropdownIconKey,
} from '../dto/dashboard-light-mode-dropdown.dto';
import { presentDashboardLightModeDropdown } from '../presenters/dashboard-light-mode-dropdown.presenter';
import { AcademicCalendarEventType } from '@prisma/client';

describe('Dashboard LightModeDropdown presenter', () => {
  it('returns the stable provider-not-configured response shape without fake weather data', () => {
    const response = presentDashboardLightModeDropdown({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      schoolLocation: {
        schoolName: 'Moazez Academy',
        profile: {
          timezone: 'Africa/Cairo',
          formattedAddress: null,
          city: 'Cairo',
          country: 'Egypt',
        },
      },
      query: {
        locale: 'en',
        timezone: 'Africa/Cairo',
        units: 'metric',
        date: '2026-07-09',
      },
    });

    expect(response).toEqual({
      generatedAt: '2026-07-09T12:00:00.000Z',
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
          conditionCode: 'provider_not_configured',
          iconKey: 'cloud',
          observedAt: null,
        },
        emptyState: {
          reason: 'provider_not_configured',
          message: 'Weather provider integration is not configured yet.',
        },
      },
      hints: [],
      highlights: [],
      cities: [],
      forecast: [],
      planner: {
        timezone: 'Africa/Cairo',
        date: '2026-07-09',
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
        plannerStatus: 'calendar_available',
        todosStatus: 'persisted',
        freshness: {
          dataMode: 'request_time_snapshot',
          cacheStatus: 'not_used',
          realtimeStatus: 'not_used',
        },
        componentFreshness: {
          location: 'request_time_snapshot',
          todos: 'persisted_user_data',
          weather: 'not_available',
          plannerEvents: 'persisted_school_data',
        },
        deferred: {
          weatherProvider: 'deferred',
          weatherCache: 'deferred',
          todoPersistence: 'persisted',
          plannerCalendar: 'available',
          crossModulePlannerItems: 'deferred',
          realtime: 'deferred',
        },
      },
    });
    expect(response.forecast).toHaveLength(0);
    expect(response.planner.events).toHaveLength(0);
    expect(response.planner.todos).toHaveLength(0);
    expect(response.weather.current.temperature).toBeNull();
    expect(response.weather.current.lowTemperature).toBeNull();
    expect(response.weather.current.feelsLike).toBeNull();
    expectIconKeysAreSemanticStrings(response);
    expectNoInternalLeaks(response);
  });

  it('uses formatted address as the display label when present', () => {
    const response = presentDashboardLightModeDropdown({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      schoolLocation: {
        schoolName: 'Moazez Academy',
        profile: {
          timezone: 'Africa/Cairo',
          formattedAddress: 'New Cairo, Cairo Governorate, Egypt',
          city: 'Cairo',
          country: 'Egypt',
        },
      },
      query: {
        locale: 'ar',
        timezone: 'Europe/Berlin',
        units: 'imperial',
        date: '2026-07-10',
      },
    });

    expect(response.location).toEqual({
      label: 'New Cairo, Cairo Governorate, Egypt',
      city: 'Cairo',
      country: 'Egypt',
      timezone: 'Europe/Berlin',
      source: 'school_profile',
    });
    expect(response.meta.locale).toBe('ar');
    expect(response.meta.units).toBe('imperial');
    expect(response.planner).toMatchObject({
      timezone: 'Europe/Berlin',
      date: '2026-07-10',
    });
  });

  it('handles missing profile location with a stable location-missing empty state', () => {
    const response = presentDashboardLightModeDropdown({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      schoolLocation: {
        schoolName: 'Minimal School',
        profile: {
          timezone: null,
          formattedAddress: null,
          city: null,
          country: null,
        },
      },
      query: {
        locale: 'en',
        timezone: 'UTC',
        units: 'metric',
        date: '2026-07-09',
      },
    });

    expect(response.location).toEqual({
      label: null,
      city: null,
      country: null,
      timezone: 'UTC',
      source: 'school_profile',
    });
    expect(response.weather.status).toBe('location_missing');
    expect(response.weather.emptyState).toEqual({
      reason: 'location_missing',
      message:
        'School location is not configured yet, so weather data is unavailable.',
    });
    expect(response.meta.weatherStatus).toBe('location_missing');
    expectNoInternalLeaks(response);
  });

  it('maps every Calendar type with safe all-day dates and exact metadata', () => {
    const response = presentDashboardLightModeDropdown({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      schoolLocation: schoolLocation(),
      query: query(),
      calendarEvents: [
        calendarEvent('holiday', AcademicCalendarEventType.HOLIDAY, true),
        calendarEvent('exam', AcademicCalendarEventType.EXAM, true),
        calendarEvent('activity', AcademicCalendarEventType.ACTIVITY, true),
        calendarEvent('other', AcademicCalendarEventType.OTHER, true),
      ],
    });

    expect(response.planner.eventDates).toEqual(['2026-07-09']);
    expect(response.planner.events).toEqual([
      expect.objectContaining({
        eventId: 'holiday',
        source: 'academic_calendar',
        eventType: 'holiday',
        tone: 'info',
        iconKey: 'calendar',
        date: '2026-07-09',
        endDate: '2026-07-10',
        startTime: null,
        endTime: null,
        allDay: true,
      }),
      expect.objectContaining({
        eventType: 'exam',
        tone: 'warning',
        iconKey: 'clock',
      }),
      expect.objectContaining({
        eventType: 'activity',
        tone: 'success',
        iconKey: 'check-circle',
      }),
      expect.objectContaining({
        eventType: 'other',
        tone: 'neutral',
        iconKey: 'calendar',
      }),
    ]);
    expect(response.meta).toMatchObject({
      plannerStatus: 'calendar_available',
      componentFreshness: { plannerEvents: 'persisted_school_data' },
      deferred: {
        plannerCalendar: 'available',
        crossModulePlannerItems: 'deferred',
        weatherProvider: 'deferred',
      },
    });
    expectNoInternalLeaks(response);
  });

  it('maps timed multi-day events in the planner timezone with an h23 midnight', () => {
    const response = presentDashboardLightModeDropdown({
      generatedAt: new Date('2026-07-09T12:00:00.000Z'),
      schoolLocation: schoolLocation(),
      query: query(),
      calendarEvents: [
        {
          ...calendarEvent('timed', AcademicCalendarEventType.EXAM, false),
          startDate: new Date('2026-07-08T21:00:00.000Z'),
          endDate: new Date('2026-07-09T22:30:00.000Z'),
        },
      ],
    });

    expect(response.planner.events[0]).toMatchObject({
      date: '2026-07-09',
      endDate: '2026-07-10',
      startTime: '00:00',
      endTime: '01:30',
      allDay: false,
    });
    expect(response.planner.events[0].startTime).not.toBe('24:00');
  });

  it.each([
    [
      'Calendar',
      [calendarEvent('event', AcademicCalendarEventType.OTHER, true)],
      [],
    ],
    ['Todos', [], [{ id: 'todo-1' } as any]],
    [
      'both',
      [calendarEvent('event', AcademicCalendarEventType.OTHER, true)],
      [{ id: 'todo-1' } as any],
    ],
  ])(
    'includes only the selected date in eventDates for %s data',
    (_label, calendarEvents, todos) => {
      const response = presentDashboardLightModeDropdown({
        generatedAt: new Date('2026-07-09T12:00:00.000Z'),
        schoolLocation: schoolLocation(),
        query: query(),
        calendarEvents,
        todos: todos.length
          ? [
              {
                id: 'todo-1',
                date: new Date('2026-07-09T00:00:00.000Z'),
                title: 'Todo',
                notes: null,
                status: 'PENDING',
                priority: 'NORMAL',
                sortOrder: 0,
                completedAt: null,
                createdAt: new Date('2026-07-09T10:00:00.000Z'),
                updatedAt: new Date('2026-07-09T10:00:00.000Z'),
              } as any,
            ]
          : [],
      });
      expect(response.planner.eventDates).toEqual(['2026-07-09']);
    },
  );
});

function query() {
  return {
    locale: 'en' as const,
    timezone: 'Africa/Cairo',
    units: 'metric' as const,
    date: '2026-07-09',
  };
}

function schoolLocation() {
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

function calendarEvent(
  id: string,
  type: AcademicCalendarEventType,
  allDay: boolean,
) {
  return {
    id,
    title: `Event ${id}`,
    type,
    allDay,
    startDate: new Date('2026-07-09T00:00:00.000Z'),
    endDate: new Date('2026-07-10T00:00:00.000Z'),
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
