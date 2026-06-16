import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AppCalendarEventsQueryDto } from '../../../academics/calendar/app-facing/dto/app-calendar-events-query.dto';
import {
  AppCalendarEventResponseDto,
  AppCalendarEventsListResponseDto,
} from '../../../academics/calendar/app-facing/dto/app-calendar-event-response.dto';
import { GetTeacherCalendarEventUseCase } from '../application/get-teacher-calendar-event.use-case';
import { ListTeacherCalendarEventsUseCase } from '../application/list-teacher-calendar-events.use-case';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher/calendar/events')
export class TeacherCalendarController {
  constructor(
    private readonly listTeacherCalendarEventsUseCase: ListTeacherCalendarEventsUseCase,
    private readonly getTeacherCalendarEventUseCase: GetTeacherCalendarEventUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List current teacher calendar events' })
  @ApiOkResponse({ type: AppCalendarEventsListResponseDto })
  listEvents(
    @Query() query: AppCalendarEventsQueryDto,
  ): Promise<AppCalendarEventsListResponseDto> {
    return this.listTeacherCalendarEventsUseCase.execute(query);
  }

  @Get(':eventId')
  @ApiOperation({ summary: 'Get a current teacher calendar event' })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiOkResponse({ type: AppCalendarEventResponseDto })
  getEvent(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
  ): Promise<AppCalendarEventResponseDto> {
    return this.getTeacherCalendarEventUseCase.execute(eventId);
  }
}
