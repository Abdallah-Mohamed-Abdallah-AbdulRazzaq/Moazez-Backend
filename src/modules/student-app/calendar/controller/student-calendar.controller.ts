import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { AppCalendarEventsQueryDto } from '../../../academics/calendar/app-facing/dto/app-calendar-events-query.dto';
import {
  AppCalendarEventResponseDto,
  AppCalendarEventsListResponseDto,
} from '../../../academics/calendar/app-facing/dto/app-calendar-event-response.dto';
import { GetStudentCalendarEventUseCase } from '../application/get-student-calendar-event.use-case';
import { ListStudentCalendarEventsUseCase } from '../application/list-student-calendar-events.use-case';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/calendar/events')
export class StudentCalendarController {
  constructor(
    private readonly listStudentCalendarEventsUseCase: ListStudentCalendarEventsUseCase,
    private readonly getStudentCalendarEventUseCase: GetStudentCalendarEventUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List current student calendar events' })
  @ApiOkResponse({ type: AppCalendarEventsListResponseDto })
  @RequiredPermissions('academics.calendar.view')
  listEvents(
    @Query() query: AppCalendarEventsQueryDto,
  ): Promise<AppCalendarEventsListResponseDto> {
    return this.listStudentCalendarEventsUseCase.execute(query);
  }

  @Get(':eventId')
  @ApiOperation({ summary: 'Get a current student calendar event' })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiOkResponse({ type: AppCalendarEventResponseDto })
  @RequiredPermissions('academics.calendar.view')
  getEvent(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
  ): Promise<AppCalendarEventResponseDto> {
    return this.getStudentCalendarEventUseCase.execute(eventId);
  }
}
