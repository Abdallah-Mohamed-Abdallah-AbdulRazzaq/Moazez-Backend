import {
  IsDateString,
  IsIn,
  IsOptional,
  IsTimeZone,
  Matches,
} from 'class-validator';
import { DashboardFreshnessMetadataDto } from './dashboard-metadata.dto';

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
  source!: 'academic_calendar';
  eventType!: 'holiday' | 'exam' | 'activity' | 'other';
  title!: string;
  date!: string;
  endDate!: string;
  startTime!: string | null;
  endTime!: string | null;
  allDay!: boolean;
  tone!: 'info' | 'warning' | 'success' | 'neutral';
  iconKey!: DashboardLightModeDropdownIconKey;
}

export class DashboardLightModeDropdownPlannerTodoDto {
  todoId!: string;
  date!: string;
  title!: string;
  notes!: string | null;
  status!: 'pending' | 'completed';
  priority!: 'low' | 'normal' | 'high';
  sortOrder!: number;
  completedAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
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
  todoPersistence!: 'persisted';
  plannerCalendar!: 'available';
  crossModulePlannerItems!: 'deferred';
  realtime!: 'deferred';
}

export class DashboardLightModeDropdownMetaDto {
  source!: 'dashboard_light_mode_dropdown';
  version!: 'v1';
  locale!: DashboardLightModeDropdownLocale;
  units!: DashboardLightModeDropdownUnits;
  weatherStatus!: 'provider_not_configured' | 'location_missing';
  plannerStatus!: 'calendar_available';
  todosStatus!: 'persisted';
  freshness!: DashboardFreshnessMetadataDto;
  componentFreshness!: {
    location: 'request_time_snapshot';
    todos: 'persisted_user_data';
    weather: 'not_available';
    plannerEvents: 'persisted_school_data';
  };
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
