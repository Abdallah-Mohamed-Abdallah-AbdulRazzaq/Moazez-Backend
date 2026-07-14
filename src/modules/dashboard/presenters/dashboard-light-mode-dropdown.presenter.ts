import {
  DashboardLightModeDropdownPlannerEventDto,
  DashboardLightModeDropdownLocationSource,
  DashboardLightModeDropdownResponseDto,
  DashboardLightModeDropdownWeatherStatus,
} from '../dto/dashboard-light-mode-dropdown.dto';
import type { NormalizedDashboardLightModeDropdownQuery } from '../application/get-dashboard-light-mode-dropdown.use-case';
import { AcademicCalendarEventType } from '@prisma/client';
import { formatDashboardCivilDate } from '../domain/dashboard-time-context';
import { DashboardPlannerCalendarEventSnapshot } from '../infrastructure/dashboard-planner-calendar.repository';
import { DashboardPlannerItemSnapshot } from '../infrastructure/dashboard-planner-items.repository';
import { DashboardLightModeDropdownSchoolLocationSnapshot } from '../infrastructure/dashboard-light-mode-dropdown.repository';
import { DashboardTodoSnapshot } from '../infrastructure/dashboard-todos.repository';
import { presentDashboardTodo } from './dashboard-todos.presenter';
import { dashboardFreshness } from './dashboard-metadata.presenter';

export interface DashboardLightModeDropdownPresentationInput {
  generatedAt: Date;
  schoolLocation: DashboardLightModeDropdownSchoolLocationSnapshot;
  query: NormalizedDashboardLightModeDropdownQuery;
  todos?: DashboardTodoSnapshot[];
  calendarEvents?: DashboardPlannerCalendarEventSnapshot[];
  plannerItems?: DashboardPlannerItemSnapshot[];
}

export function presentDashboardLightModeDropdown(
  input: DashboardLightModeDropdownPresentationInput,
): DashboardLightModeDropdownResponseDto {
  const location = buildLocation(input.schoolLocation, input.query.timezone);
  const weatherStatus = resolveWeatherStatus(location);

  const calendarEvents = (input.calendarEvents ?? []).map((event) =>
    presentDashboardPlannerCalendarEvent(event, input.query.timezone),
  );
  const plannerItems = (input.plannerItems ?? []).map((item) =>
    presentDashboardPlannerItem(item, input.query.timezone, input.query.locale),
  );
  const todos = (input.todos ?? []).map(presentDashboardTodo);

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
      eventDates:
        calendarEvents.length > 0 || plannerItems.length > 0 || todos.length > 0
          ? [input.query.date]
          : [],
      events: [...calendarEvents, ...plannerItems],
      todos,
    },
    meta: {
      source: 'dashboard_light_mode_dropdown',
      version: 'v1',
      locale: input.query.locale,
      units: input.query.units,
      weatherStatus,
      plannerStatus: 'cross_module_available',
      todosStatus: 'persisted',
      freshness: dashboardFreshness('request_time_snapshot'),
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
        crossModulePlannerItems: 'available',
        realtime: 'deferred',
      },
    },
  };
}

export function presentDashboardPlannerCalendarEvent(
  event: DashboardPlannerCalendarEventSnapshot,
  timezone: string,
): DashboardLightModeDropdownPlannerEventDto {
  const presentation = calendarEventPresentation(event.type);
  const date = event.allDay
    ? event.startDate.toISOString().slice(0, 10)
    : formatDashboardCivilDate(event.startDate, timezone);
  const endDate = event.allDay
    ? event.endDate.toISOString().slice(0, 10)
    : formatDashboardCivilDate(event.endDate, timezone);

  return {
    eventId: event.id,
    source: 'academic_calendar',
    eventType: presentation.eventType,
    title: event.title,
    date,
    endDate,
    startTime: event.allDay
      ? null
      : formatDashboardPlannerTime(event.startDate, timezone),
    endTime: event.allDay
      ? null
      : formatDashboardPlannerTime(event.endDate, timezone),
    allDay: event.allDay,
    tone: presentation.tone,
    iconKey: presentation.iconKey,
  };
}

export function presentDashboardPlannerItem(
  item: DashboardPlannerItemSnapshot,
  timezone: string,
  locale: 'en' | 'ar',
): DashboardLightModeDropdownPlannerEventDto {
  switch (item.source) {
    case 'attendance_session':
      return {
        eventId: `attendance_session:${item.id}`,
        source: item.source,
        eventType: 'attendance',
        title:
          normalizeOptionalText(item.periodLabelEn) ??
          normalizeOptionalText(item.periodLabelAr) ??
          'Attendance session',
        date: logicalDate(item.date),
        endDate: logicalDate(item.date),
        startTime: null,
        endTime: null,
        allDay: true,
        tone: item.status === 'DRAFT' ? 'warning' : 'success',
        iconKey: item.status === 'DRAFT' ? 'clock' : 'check-circle',
      };

    case 'placement_test': {
      const type = normalizeOptionalText(item.type);
      return timedPlannerItem({
        eventId: `placement_test:${item.id}`,
        source: item.source,
        eventType: 'placement_test',
        title: type ? `Placement test — ${type}` : 'Placement test',
        instant: item.scheduledAt,
        timezone,
        tone: 'warning',
      });
    }

    case 'interview':
      return timedPlannerItem({
        eventId: `interview:${item.id}`,
        source: item.source,
        eventType: 'interview',
        title: 'Admissions interview',
        instant: item.scheduledAt,
        timezone,
        tone: 'info',
      });

    case 'homework_due':
      return timedPlannerItem({
        eventId: `homework_due:${item.id}`,
        source: item.source,
        eventType: 'homework_due',
        title: item.title,
        instant: item.dueAt,
        timezone,
        tone: 'warning',
      });

    case 'grade_assessment':
      return {
        eventId: `grade_assessment:${item.id}`,
        source: item.source,
        eventType: 'assessment',
        title:
          (locale === 'ar'
            ? (normalizeOptionalText(item.titleAr) ??
              normalizeOptionalText(item.titleEn))
            : (normalizeOptionalText(item.titleEn) ??
              normalizeOptionalText(item.titleAr))) ?? 'Grade assessment',
        date: logicalDate(item.date),
        endDate: logicalDate(item.date),
        startTime: null,
        endTime: null,
        allDay: true,
        tone: 'warning',
        iconKey: 'calendar',
      };
  }
}

function timedPlannerItem(input: {
  eventId: string;
  source: 'placement_test' | 'interview' | 'homework_due';
  eventType: 'placement_test' | 'interview' | 'homework_due';
  title: string;
  instant: Date;
  timezone: string;
  tone: 'info' | 'warning';
}): DashboardLightModeDropdownPlannerEventDto {
  const date = formatDashboardCivilDate(input.instant, input.timezone);
  return {
    eventId: input.eventId,
    source: input.source,
    eventType: input.eventType,
    title: input.title,
    date,
    endDate: date,
    startTime: formatDashboardPlannerTime(input.instant, input.timezone),
    endTime: null,
    allDay: false,
    tone: input.tone,
    iconKey: 'clock',
  };
}

function logicalDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function calendarEventPresentation(type: AcademicCalendarEventType): {
  eventType: DashboardLightModeDropdownPlannerEventDto['eventType'];
  tone: DashboardLightModeDropdownPlannerEventDto['tone'];
  iconKey: DashboardLightModeDropdownPlannerEventDto['iconKey'];
} {
  switch (type) {
    case AcademicCalendarEventType.HOLIDAY:
      return { eventType: 'holiday', tone: 'info', iconKey: 'calendar' };
    case AcademicCalendarEventType.EXAM:
      return { eventType: 'exam', tone: 'warning', iconKey: 'clock' };
    case AcademicCalendarEventType.ACTIVITY:
      return {
        eventType: 'activity',
        tone: 'success',
        iconKey: 'check-circle',
      };
    case AcademicCalendarEventType.OTHER:
      return { eventType: 'other', tone: 'neutral', iconKey: 'calendar' };
  }
}

function formatDashboardPlannerTime(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get('hour')}:${byType.get('minute')}`;
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
