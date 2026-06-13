import { Module } from '@nestjs/common';
import { AuthModule } from '../../iam/auth/auth.module';
import { CreateCalendarEventUseCase } from './application/create-calendar-event.use-case';
import { DeleteCalendarEventUseCase } from './application/delete-calendar-event.use-case';
import { GetCalendarEventUseCase } from './application/get-calendar-event.use-case';
import { ListCalendarEventsUseCase } from './application/list-calendar-events.use-case';
import { UpdateCalendarEventUseCase } from './application/update-calendar-event.use-case';
import { CalendarEventsController } from './controller/calendar-events.controller';
import { CalendarEventsRepository } from './infrastructure/calendar-events.repository';

@Module({
  imports: [AuthModule],
  controllers: [CalendarEventsController],
  providers: [
    CalendarEventsRepository,
    ListCalendarEventsUseCase,
    CreateCalendarEventUseCase,
    GetCalendarEventUseCase,
    UpdateCalendarEventUseCase,
    DeleteCalendarEventUseCase,
  ],
  exports: [
    CalendarEventsRepository,
    ListCalendarEventsUseCase,
    GetCalendarEventUseCase,
  ],
})
export class CalendarModule {}
