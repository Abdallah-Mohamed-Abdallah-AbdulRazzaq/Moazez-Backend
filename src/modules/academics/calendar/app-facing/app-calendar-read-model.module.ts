import { Module } from '@nestjs/common';
import { GetAppCalendarEventUseCase } from './application/get-app-calendar-event.use-case';
import { ListAppCalendarEventsUseCase } from './application/list-app-calendar-events.use-case';
import { AppCalendarEventsRepository } from './infrastructure/app-calendar-events.repository';
import { AppCalendarVisibilityService } from './visibility/app-calendar-visibility.service';

@Module({
  providers: [
    AppCalendarEventsRepository,
    AppCalendarVisibilityService,
    ListAppCalendarEventsUseCase,
    GetAppCalendarEventUseCase,
  ],
  exports: [
    AppCalendarVisibilityService,
    ListAppCalendarEventsUseCase,
    GetAppCalendarEventUseCase,
  ],
})
export class AppCalendarReadModelModule {}
