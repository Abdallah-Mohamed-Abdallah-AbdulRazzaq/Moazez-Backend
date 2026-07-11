import {
  DashboardLightModeDropdownLocationSource,
  DashboardLightModeDropdownResponseDto,
  DashboardLightModeDropdownWeatherStatus,
} from '../dto/dashboard-light-mode-dropdown.dto';
import { NormalizedDashboardLightModeDropdownQuery } from '../application/get-dashboard-light-mode-dropdown.use-case';
import { DashboardLightModeDropdownSchoolLocationSnapshot } from '../infrastructure/dashboard-light-mode-dropdown.repository';
import { DashboardTodoSnapshot } from '../infrastructure/dashboard-todos.repository';
import { presentDashboardTodo } from './dashboard-todos.presenter';

export interface DashboardLightModeDropdownPresentationInput {
  generatedAt: Date;
  schoolLocation: DashboardLightModeDropdownSchoolLocationSnapshot;
  query: NormalizedDashboardLightModeDropdownQuery;
  todos?: DashboardTodoSnapshot[];
}

export function presentDashboardLightModeDropdown(
  input: DashboardLightModeDropdownPresentationInput,
): DashboardLightModeDropdownResponseDto {
  const location = buildLocation(input.schoolLocation, input.query.timezone);
  const weatherStatus = resolveWeatherStatus(location);

  return {
    generatedAt: input.generatedAt.toISOString(),
    location,
    weather: {
      status: weatherStatus,
      provider: null,
      current: {
        temperature: null,
        lowTemperature: null,
        feelsLike: null,
        condition: 'Weather unavailable',
        conditionCode: weatherStatus,
        iconKey: 'cloud',
        observedAt: null,
      },
      emptyState: buildWeatherEmptyState(weatherStatus),
    },
    hints: [],
    highlights: [],
    cities: [],
    forecast: [],
    planner: {
      timezone: input.query.timezone,
      date: input.query.date,
      eventDates: [],
      events: [],
      todos: (input.todos ?? []).map(presentDashboardTodo),
    },
    meta: {
      source: 'dashboard_light_mode_dropdown',
      version: 'v1',
      locale: input.query.locale,
      units: input.query.units,
      weatherStatus,
      plannerStatus: 'foundation_only',
      todosStatus: 'persisted',
      deferred: {
        weatherProvider: 'deferred',
        weatherCache: 'deferred',
        todoPersistence: 'persisted',
        plannerCalendar: 'deferred',
        crossModulePlannerItems: 'deferred',
        realtime: 'deferred',
      },
    },
  };
}

function buildLocation(
  schoolLocation: DashboardLightModeDropdownSchoolLocationSnapshot,
  timezone: string,
): DashboardLightModeDropdownResponseDto['location'] {
  const city = normalizeOptionalText(schoolLocation.profile?.city);
  const country = normalizeOptionalText(schoolLocation.profile?.country);
  const formattedAddress = normalizeOptionalText(
    schoolLocation.profile?.formattedAddress,
  );
  const label = formattedAddress ?? joinLocationLabel(city, country);

  return {
    label,
    city,
    country,
    timezone,
    source: resolveLocationSource(schoolLocation),
  };
}

function resolveLocationSource(
  schoolLocation: DashboardLightModeDropdownSchoolLocationSnapshot,
): DashboardLightModeDropdownLocationSource {
  if (schoolLocation.profile) return 'school_profile';
  if (normalizeOptionalText(schoolLocation.schoolName)) return 'school_record';
  return 'fallback';
}

function resolveWeatherStatus(
  location: DashboardLightModeDropdownResponseDto['location'],
): 'provider_not_configured' | 'location_missing' {
  return location.label || location.city || location.country
    ? 'provider_not_configured'
    : 'location_missing';
}

function buildWeatherEmptyState(
  weatherStatus: DashboardLightModeDropdownWeatherStatus,
) {
  if (weatherStatus === 'location_missing') {
    return {
      reason: 'location_missing' as const,
      message:
        'School location is not configured yet, so weather data is unavailable.',
    };
  }

  return {
    reason: 'provider_not_configured' as const,
    message: 'Weather provider integration is not configured yet.',
  };
}

function joinLocationLabel(
  city: string | null,
  country: string | null,
): string | null {
  return [city, country].filter(Boolean).join(', ') || null;
}

function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
