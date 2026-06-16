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
import { GetParentCalendarEventUseCase } from '../application/get-parent-calendar-event.use-case';
import { ListParentCalendarEventsUseCase } from '../application/list-parent-calendar-events.use-case';

@ApiTags('parent-app')
@ApiBearerAuth()
@Controller('parent/children/:studentId/calendar/events')
export class ParentCalendarController {
  constructor(
    private readonly listParentCalendarEventsUseCase: ListParentCalendarEventsUseCase,
    private readonly getParentCalendarEventUseCase: GetParentCalendarEventUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List owned child calendar events' })
  @ApiParam({ name: 'studentId', description: 'Owned child student id.' })
  @ApiOkResponse({ type: AppCalendarEventsListResponseDto })
  listEvents(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: AppCalendarEventsQueryDto,
  ): Promise<AppCalendarEventsListResponseDto> {
    return this.listParentCalendarEventsUseCase.execute({ studentId, query });
  }

  @Get(':eventId')
  @ApiOperation({ summary: 'Get an owned child calendar event' })
  @ApiParam({ name: 'studentId', description: 'Owned child student id.' })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiOkResponse({ type: AppCalendarEventResponseDto })
  getEvent(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
  ): Promise<AppCalendarEventResponseDto> {
    return this.getParentCalendarEventUseCase.execute({
      studentId,
      eventId,
    });
  }
}
