import {
  CalendarEventScopeTypeDto,
  CalendarEventTypeDto,
} from './calendar-event.dto';

export class CalendarEventScopeResponseDto {
  type!: CalendarEventScopeTypeDto;
  id!: string | null;
}

export class CalendarEventResponseDto {
  id!: string;
  academicYearId!: string;
  termId!: string;
  title!: string;
  description!: string | null;
  notes!: string | null;
  type!: CalendarEventTypeDto;
  scope!: CalendarEventScopeResponseDto;
  allDay!: boolean;
  startDate!: string;
  endDate!: string;
  createdAt!: string;
  updatedAt!: string;
}

export class CalendarEventsListResponseDto {
  items!: CalendarEventResponseDto[];
  nextCursor!: string | null;
}

export class DeleteCalendarEventResponseDto {
  id!: string;
  deleted!: boolean;
}
