import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { GetParentChildTodayScheduleUseCase } from '../application/get-parent-child-today-schedule.use-case';
import { GetParentChildWeeklyScheduleUseCase } from '../application/get-parent-child-weekly-schedule.use-case';
import {
  ParentChildTodayScheduleResponseDto,
  ParentChildWeeklyScheduleResponseDto,
} from '../dto/parent-schedule.dto';

@ApiTags('parent-app')
@ApiBearerAuth()
@Controller('parent/children/:studentId/schedule')
export class ParentScheduleController {
  constructor(
    private readonly getTodayScheduleUseCase: GetParentChildTodayScheduleUseCase,
    private readonly getWeeklyScheduleUseCase: GetParentChildWeeklyScheduleUseCase,
  ) {}

  @Get('today')
  @ApiOperation({ summary: 'Get an owned child schedule for today' })
  @ApiParam({ name: 'studentId', description: 'Owned child student id.' })
  @ApiOkResponse({ type: ParentChildTodayScheduleResponseDto })
  getTodaySchedule(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<ParentChildTodayScheduleResponseDto> {
    return this.getTodayScheduleUseCase.execute(studentId);
  }

  @Get('weekly')
  @ApiOperation({ summary: 'Get an owned child weekly schedule' })
  @ApiParam({ name: 'studentId', description: 'Owned child student id.' })
  @ApiOkResponse({ type: ParentChildWeeklyScheduleResponseDto })
  getWeeklySchedule(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ): Promise<ParentChildWeeklyScheduleResponseDto> {
    return this.getWeeklyScheduleUseCase.execute(studentId);
  }
}
