import {
  IsDateString,
  IsIn,
  IsOptional,
  IsTimeZone,
  Matches,
} from 'class-validator';

export const DASHBOARD_LIGHT_MODE_DROPDOWN_LOCALES = ['en', 'ar'] as const;
export const DASHBOARD_LIGHT_MODE_DROPDOWN_UNITS = [
  'metric',
  'imperial',
] as const;
export const DASHBOARD_LIGHT_MODE_DROPDOWN_ICON_KEYS = [
  'sun',
  'cloud',
  'cloud-rain',
  'cloud-snow',
  'wind',
  'droplets',
  'sunrise',
  'sunset',
  'eye',
  'gauge',
  'thermometer',
  'calendar',
  'clock',
  'check-circle',
] as const;
export const DASHBOARD_LIGHT_MODE_DROPDOWN_WEATHER_STATUSES = [
  'available',
  'unavailable',
  'provider_not_configured',
  'location_missing',
  'provider_failed',
] as const;

export type DashboardLightModeDropdownLocale =
  (typeof DASHBOARD_LIGHT_MODE_DROPDOWN_LOCALES)[number];
export type DashboardLightModeDropdownUnits =
  (typeof DASHBOARD_LIGHT_MODE_DROPDOWN_UNITS)[number];
export type DashboardLightModeDropdownIconKey =
  (typeof DASHBOARD_LIGHT_MODE_DROPDOWN_ICON_KEYS)[number];
export type DashboardLightModeDropdownWeatherStatus =
  (typeof DASHBOARD_LIGHT_MODE_DROPDOWN_WEATHER_STATUSES)[number];
export type DashboardLightModeDropdownLocationSource =
  | 'school_profile'
  | 'school_record'
  | 'fallback';

export class GetDashboardLightModeDropdownQueryDto {
  @IsOptional()
  @IsIn(DASHBOARD_LIGHT_MODE_DROPDOWN_LOCALES)
  locale?: DashboardLightModeDropdownLocale;

  @IsOptional()
  @IsTimeZone()
  timezone?: string;

  @IsOptional()
  @IsIn(DASHBOARD_LIGHT_MODE_DROPDOWN_UNITS)
  units?: DashboardLightModeDropdownUnits;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString()
  date?: string;
}

export class DashboardLightModeDropdownLocationDto {
  label!: string | null;
  city!: string | null;
  country!: string | null;
  timezone!: string;
  source!: DashboardLightModeDropdownLocationSource;
}

export class DashboardLightModeDropdownWeatherCurrentDto {
  temperature!: number | null;
  lowTemperature!: number | null;
  feelsLike!: number | null;
  condition!: string;
  conditionCode!: DashboardLightModeDropdownWeatherStatus;
  iconKey!: DashboardLightModeDropdownIconKey;
  observedAt!: string | null;
}

export class DashboardLightModeDropdownEmptyStateDto {
  reason!: 'provider_not_configured' | 'location_missing';
  message!: string;
}

export class DashboardLightModeDropdownWeatherDto {
  status!: DashboardLightModeDropdownWeatherStatus;
  provider!: string | null;
  current!: DashboardLightModeDropdownWeatherCurrentDto;
  emptyState!: DashboardLightModeDropdownEmptyStateDto;
}

export class DashboardLightModeDropdownHintDto {
  key!: string;
  text!: string;
  iconKey!: DashboardLightModeDropdownIconKey;
  tone!: 'info' | 'warning' | 'critical' | 'success' | 'neutral';
}

export class DashboardLightModeDropdownHighlightDto {
  key!: string;
  label!: string;
  value!: number | string | null;
  unit!: string | null;
  iconKey!: DashboardLightModeDropdownIconKey;
}

export class DashboardLightModeDropdownCityWeatherDto {
  city!: string;
  country!: string | null;
  temperature!: number | null;
  condition!: string;
  iconKey!: DashboardLightModeDropdownIconKey;
}

export class DashboardLightModeDropdownForecastDto {
  date!: string;
  label!: string;
  high!: number | null;
  low!: number | null;
  condition!: string;
  iconKey!: DashboardLightModeDropdownIconKey;
}

export class DashboardLightModeDropdownPlannerEventDto {
  eventId!: string;
  source!: string;
  title!: string;
  date!: string;
  startTime!: string | null;
  endTime!: string | null;
  allDay!: boolean;
  tone!: 'info' | 'warning' | 'critical' | 'success' | 'neutral';
  iconKey!: DashboardLightModeDropdownIconKey;
}

export class DashboardLightModeDropdownPlannerTodoDto {
  id!: string;
  title!: string;
  description!: string | null;
  priority!: 'low' | 'medium' | 'high';
  date!: string;
  timeMinutes!: number | null;
  completed!: boolean;
}

export class DashboardLightModeDropdownPlannerDto {
  timezone!: string;
  date!: string;
  eventDates!: string[];
  events!: DashboardLightModeDropdownPlannerEventDto[];
  todos!: DashboardLightModeDropdownPlannerTodoDto[];
}

export class DashboardLightModeDropdownDeferredDto {
  weatherProvider!: 'deferred';
  weatherCache!: 'deferred';
  todoPersistence!: 'deferred';
  plannerCalendar!: 'deferred';
  crossModulePlannerItems!: 'deferred';
  realtime!: 'deferred';
}

export class DashboardLightModeDropdownMetaDto {
  source!: 'dashboard_light_mode_dropdown';
  version!: 'v1';
  locale!: DashboardLightModeDropdownLocale;
  units!: DashboardLightModeDropdownUnits;
  weatherStatus!: 'provider_not_configured' | 'location_missing';
  plannerStatus!: 'foundation_only';
  todosStatus!: 'not_persisted';
  deferred!: DashboardLightModeDropdownDeferredDto;
}

export class DashboardLightModeDropdownResponseDto {
  generatedAt!: string;
  location!: DashboardLightModeDropdownLocationDto;
  weather!: DashboardLightModeDropdownWeatherDto;
  hints!: DashboardLightModeDropdownHintDto[];
  highlights!: DashboardLightModeDropdownHighlightDto[];
  cities!: DashboardLightModeDropdownCityWeatherDto[];
  forecast!: DashboardLightModeDropdownForecastDto[];
  planner!: DashboardLightModeDropdownPlannerDto;
  meta!: DashboardLightModeDropdownMetaDto;
}
