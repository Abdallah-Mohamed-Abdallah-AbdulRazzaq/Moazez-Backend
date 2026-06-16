import {
  CalendarEventScopeTypeDto,
  CalendarEventTypeDto,
} from '../../dto/calendar-event.dto';

export class AppCalendarEventScopeResponseDto {
  type!: CalendarEventScopeTypeDto;
  id!: string | null;
}

export class AppCalendarEventResponseDto {
  id!: string;
  academicYearId!: string;
  termId!: string;
  title!: string;
  description!: string | null;
  type!: CalendarEventTypeDto;
  scope!: AppCalendarEventScopeResponseDto;
  allDay!: boolean;
  startDate!: string;
  endDate!: string;
}

export class AppCalendarEventsListResponseDto {
  items!: AppCalendarEventResponseDto[];
  nextCursor!: string | null;
}
