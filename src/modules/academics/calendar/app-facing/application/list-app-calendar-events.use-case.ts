import { Injectable } from '@nestjs/common';
import { AppCalendarEventsQueryDto } from '../dto/app-calendar-events-query.dto';
import { AppCalendarEventsListResponseDto } from '../dto/app-calendar-event-response.dto';
import { AppCalendarEventsRepository } from '../infrastructure/app-calendar-events.repository';
import { presentAppCalendarEvents } from '../presenters/app-calendar-event.presenter';
import type { AppCalendarVisibilityContext } from '../visibility/app-calendar-visibility.types';
import {
  mapCalendarEventScopeType,
  mapCalendarEventType,
  normalizeCalendarListWindow,
} from '../../application/calendar-event-use-case.helpers';
import {
  resolveAppCalendarAcademicFilters,
  validateAppCalendarAcademicFilters,
} from './app-calendar-query.helpers';

@Injectable()
export class ListAppCalendarEventsUseCase {
  constructor(
    private readonly appCalendarEventsRepository: AppCalendarEventsRepository,
  ) {}

  async execute(params: {
    visibility: AppCalendarVisibilityContext;
    query: AppCalendarEventsQueryDto;
  }): Promise<AppCalendarEventsListResponseDto> {
    const window = normalizeCalendarListWindow(params.query);
    const academicFilters = resolveAppCalendarAcademicFilters(
      params.visibility,
      params.query,
    );
    await validateAppCalendarAcademicFilters(
      this.appCalendarEventsRepository,
      academicFilters,
    );

    const events = await this.appCalendarEventsRepository.listVisibleEvents({
      visibility: params.visibility,
      ...academicFilters,
      from: window.from,
      to: window.to,
      type: params.query.type
        ? mapCalendarEventType(params.query.type)
        : undefined,
      scopeType: params.query.scopeType
        ? mapCalendarEventScopeType(params.query.scopeType)
        : undefined,
      limit: window.limit + 1,
      cursor: params.query.cursor,
    });
    const items = events.slice(0, window.limit);
    const nextCursor =
      events.length > window.limit ? items[items.length - 1]?.id ?? null : null;

    return presentAppCalendarEvents(items, nextCursor);
  }
}
