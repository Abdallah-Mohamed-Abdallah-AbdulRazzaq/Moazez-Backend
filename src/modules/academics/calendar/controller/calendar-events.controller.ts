import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { CreateCalendarEventUseCase } from '../application/create-calendar-event.use-case';
import { DeleteCalendarEventUseCase } from '../application/delete-calendar-event.use-case';
import { GetCalendarEventUseCase } from '../application/get-calendar-event.use-case';
import { ListCalendarEventsUseCase } from '../application/list-calendar-events.use-case';
import { UpdateCalendarEventUseCase } from '../application/update-calendar-event.use-case';
import {
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from '../dto/calendar-event.dto';
import {
  CalendarEventResponseDto,
  CalendarEventsListResponseDto,
  DeleteCalendarEventResponseDto,
} from '../dto/calendar-event-response.dto';
import { ListCalendarEventsQueryDto } from '../dto/list-calendar-events-query.dto';

@ApiTags('academics-calendar')
@ApiBearerAuth()
@Controller('academics/calendar/events')
export class CalendarEventsController {
  constructor(
    private readonly listCalendarEventsUseCase: ListCalendarEventsUseCase,
    private readonly createCalendarEventUseCase: CreateCalendarEventUseCase,
    private readonly getCalendarEventUseCase: GetCalendarEventUseCase,
    private readonly updateCalendarEventUseCase: UpdateCalendarEventUseCase,
    private readonly deleteCalendarEventUseCase: DeleteCalendarEventUseCase,
  ) {}

  @Get()
  @RequiredPermissions('academics.calendar.view')
  @ApiOperation({ summary: 'List academic calendar events' })
  @ApiOkResponse({ type: CalendarEventsListResponseDto })
  listEvents(
    @Query() query: ListCalendarEventsQueryDto,
  ): Promise<CalendarEventsListResponseDto> {
    return this.listCalendarEventsUseCase.execute(query);
  }

  @Post()
  @RequiredPermissions('academics.calendar.manage')
  @ApiOperation({ summary: 'Create an academic calendar event' })
  @ApiBody({ type: CreateCalendarEventDto })
  @ApiOkResponse({ type: CalendarEventResponseDto })
  createEvent(
    @Body() dto: CreateCalendarEventDto,
  ): Promise<CalendarEventResponseDto> {
    return this.createCalendarEventUseCase.execute(dto);
  }

  @Get(':eventId')
  @RequiredPermissions('academics.calendar.view')
  @ApiOperation({ summary: 'Get an academic calendar event' })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiOkResponse({ type: CalendarEventResponseDto })
  getEvent(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
  ): Promise<CalendarEventResponseDto> {
    return this.getCalendarEventUseCase.execute(eventId);
  }

  @Patch(':eventId')
  @RequiredPermissions('academics.calendar.manage')
  @ApiOperation({ summary: 'Update an academic calendar event' })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiBody({ type: UpdateCalendarEventDto })
  @ApiOkResponse({ type: CalendarEventResponseDto })
  updateEvent(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Body() dto: UpdateCalendarEventDto,
  ): Promise<CalendarEventResponseDto> {
    return this.updateCalendarEventUseCase.execute(eventId, dto);
  }

  @Delete(':eventId')
  @RequiredPermissions('academics.calendar.manage')
  @ApiOperation({ summary: 'Delete an academic calendar event' })
  @ApiParam({ name: 'eventId', format: 'uuid' })
  @ApiOkResponse({ type: DeleteCalendarEventResponseDto })
  deleteEvent(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
  ): Promise<DeleteCalendarEventResponseDto> {
    return this.deleteCalendarEventUseCase.execute(eventId);
  }
}
