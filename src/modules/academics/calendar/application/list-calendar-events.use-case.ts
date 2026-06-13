import { Injectable } from '@nestjs/common';
import { requireAcademicsScope } from '../../academics-context';
import { ListCalendarEventsQueryDto } from '../dto/list-calendar-events-query.dto';
import { CalendarEventsListResponseDto } from '../dto/calendar-event-response.dto';
import { CalendarEventsRepository } from '../infrastructure/calendar-events.repository';
import { presentCalendarEvents } from '../presenters/calendar-event.presenter';
import {
  mapCalendarEventType,
  normalizeCalendarListWindow,
  resolveListScopeFilter,
  validateCalendarListAcademicFilters,
} from './calendar-event-use-case.helpers';

@Injectable()
export class ListCalendarEventsUseCase {
  constructor(
    private readonly calendarEventsRepository: CalendarEventsRepository,
  ) {}

  async execute(
    query: ListCalendarEventsQueryDto,
  ): Promise<CalendarEventsListResponseDto> {
    requireAcademicsScope();
    const window = normalizeCalendarListWindow(query);
    await validateCalendarListAcademicFilters(
      this.calendarEventsRepository,
      query,
    );
    const scopeFilter = await resolveListScopeFilter(
      this.calendarEventsRepository,
      query,
    );
    const events = await this.calendarEventsRepository.listEvents({
      academicYearId: query.academicYearId,
      termId: query.termId,
      from: window.from,
      to: window.to,
      type: query.type ? mapCalendarEventType(query.type) : undefined,
      ...scopeFilter,
      limit: window.limit + 1,
      cursor: query.cursor,
    });
    const items = events.slice(0, window.limit);
    const nextCursor =
      events.length > window.limit ? items[items.length - 1]?.id ?? null : null;

    return presentCalendarEvents(items, nextCursor);
  }
}
