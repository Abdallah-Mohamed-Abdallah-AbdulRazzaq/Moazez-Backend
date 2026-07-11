import { Injectable } from '@nestjs/common';
import { requireDashboardScope } from '../dashboard-context';
import {
  DASHBOARD_LIGHT_MODE_DROPDOWN_LOCALES,
  DASHBOARD_LIGHT_MODE_DROPDOWN_UNITS,
  DashboardLightModeDropdownLocale,
  DashboardLightModeDropdownResponseDto,
  DashboardLightModeDropdownUnits,
  GetDashboardLightModeDropdownQueryDto,
} from '../dto/dashboard-light-mode-dropdown.dto';
import {
  DashboardLightModeDropdownRepository,
  DashboardLightModeDropdownSchoolLocationSnapshot,
} from '../infrastructure/dashboard-light-mode-dropdown.repository';
import { DashboardTodosRepository } from '../infrastructure/dashboard-todos.repository';
import {
  DashboardLightModeDropdownPresentationInput,
  presentDashboardLightModeDropdown,
} from '../presenters/dashboard-light-mode-dropdown.presenter';
import { toDashboardTodoDate } from './dashboard-todo.helpers';

const DEFAULT_DASHBOARD_DROPDOWN_LOCALE: DashboardLightModeDropdownLocale =
  'en';
const DEFAULT_DASHBOARD_DROPDOWN_UNITS: DashboardLightModeDropdownUnits =
  'metric';
const DEFAULT_DASHBOARD_DROPDOWN_TIMEZONE = 'UTC';
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface NormalizedDashboardLightModeDropdownQuery {
  locale: DashboardLightModeDropdownLocale;
  timezone: string;
  units: DashboardLightModeDropdownUnits;
  date: string;
}

@Injectable()
export class GetDashboardLightModeDropdownUseCase {
  constructor(
    private readonly dashboardLightModeDropdownRepository: DashboardLightModeDropdownRepository,
    private readonly dashboardTodosRepository: DashboardTodosRepository,
  ) {}

  async execute(
    query: GetDashboardLightModeDropdownQueryDto = new GetDashboardLightModeDropdownQueryDto(),
  ): Promise<DashboardLightModeDropdownResponseDto> {
    const scope = requireDashboardScope();
    const generatedAt = new Date();
    const schoolLocation =
      await this.dashboardLightModeDropdownRepository.loadSchoolLocationSnapshot(
        scope,
      );
    const normalizedQuery = normalizeDashboardLightModeDropdownQuery(
      query,
      schoolLocation,
      generatedAt,
    );
    const todos = await this.dashboardTodosRepository.listOwnedTodos(scope, {
      date: toDashboardTodoDate(normalizedQuery.date),
      limit: 100,
    });
    const input: DashboardLightModeDropdownPresentationInput = {
      generatedAt,
      schoolLocation,
      query: normalizedQuery,
      todos,
    };

    return presentDashboardLightModeDropdown(input);
  }
}

export function normalizeDashboardLightModeDropdownQuery(
  query: GetDashboardLightModeDropdownQueryDto,
  schoolLocation: DashboardLightModeDropdownSchoolLocationSnapshot,
  generatedAt: Date,
): NormalizedDashboardLightModeDropdownQuery {
  const timezone = resolveDashboardLightModeDropdownTimezone(
    query.timezone,
    schoolLocation.profile?.timezone,
  );

  return {
    locale: isDashboardLightModeDropdownLocale(query.locale)
      ? query.locale
      : DEFAULT_DASHBOARD_DROPDOWN_LOCALE,
    timezone,
    units: isDashboardLightModeDropdownUnits(query.units)
      ? query.units
      : DEFAULT_DASHBOARD_DROPDOWN_UNITS,
    date: normalizeDashboardLightModeDropdownDate(
      query.date,
      timezone,
      generatedAt,
    ),
  };
}

export function resolveDashboardLightModeDropdownTimezone(
  queryTimezone: string | undefined,
  schoolTimezone: string | null | undefined,
): string {
  const normalizedQueryTimezone = normalizeOptionalText(queryTimezone);
  if (normalizedQueryTimezone && isValidTimeZone(normalizedQueryTimezone)) {
    return normalizedQueryTimezone;
  }

  const normalizedSchoolTimezone = normalizeOptionalText(schoolTimezone);
  if (normalizedSchoolTimezone && isValidTimeZone(normalizedSchoolTimezone)) {
    return normalizedSchoolTimezone;
  }

  return DEFAULT_DASHBOARD_DROPDOWN_TIMEZONE;
}

export function normalizeDashboardLightModeDropdownDate(
  queryDate: string | undefined,
  timezone: string,
  generatedAt: Date,
): string {
  const normalizedQueryDate = normalizeOptionalText(queryDate);
  if (
    normalizedQueryDate &&
    DATE_ONLY_PATTERN.test(normalizedQueryDate) &&
    isValidDateOnly(normalizedQueryDate)
  ) {
    return normalizedQueryDate;
  }

  return formatDateInTimezone(generatedAt, timezone);
}

export function formatDateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const partByType = new Map(parts.map((part) => [part.type, part.value]));

  return `${partByType.get('year')}-${partByType.get('month')}-${partByType.get('day')}`;
}

function isDashboardLightModeDropdownLocale(
  value: unknown,
): value is DashboardLightModeDropdownLocale {
  return (
    typeof value === 'string' &&
    (DASHBOARD_LIGHT_MODE_DROPDOWN_LOCALES as readonly string[]).includes(value)
  );
}

function isDashboardLightModeDropdownUnits(
  value: unknown,
): value is DashboardLightModeDropdownUnits {
  return (
    typeof value === 'string' &&
    (DASHBOARD_LIGHT_MODE_DROPDOWN_UNITS as readonly string[]).includes(value)
  );
}

function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function isValidDateOnly(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
