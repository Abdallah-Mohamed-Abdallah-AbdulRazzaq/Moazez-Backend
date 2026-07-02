import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetTeacherDailyScheduleUseCase } from '../application/get-teacher-daily-schedule.use-case';
import { GetTeacherWeeklyScheduleUseCase } from '../application/get-teacher-weekly-schedule.use-case';
import {
  TeacherDailyScheduleResponseDto,
  TeacherScheduleDateQueryDto,
  TeacherWeeklyScheduleResponseDto,
} from '../dto/teacher-schedule.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher/schedule')
export class TeacherScheduleController {
  constructor(
    private readonly getTeacherDailyScheduleUseCase: GetTeacherDailyScheduleUseCase,
    private readonly getTeacherWeeklyScheduleUseCase: GetTeacherWeeklyScheduleUseCase,
  ) {}

  @Get()
  @RequiredPermissions('academics.timetable.view')
  @ApiOperation({ summary: 'Get the current teacher daily schedule' })
  @ApiQuery({
    name: 'date',
    required: true,
    description: 'Calendar date in YYYY-MM-DD format.',
  })
  @ApiOkResponse({ type: TeacherDailyScheduleResponseDto })
  getDailySchedule(
    @Query() query: TeacherScheduleDateQueryDto,
  ): Promise<TeacherDailyScheduleResponseDto> {
    return this.getTeacherDailyScheduleUseCase.execute({ date: query.date });
  }

  @Get('week')
  @RequiredPermissions('academics.timetable.view')
  @ApiOperation({ summary: 'Get the current teacher weekly schedule' })
  @ApiQuery({
    name: 'date',
    required: true,
    description:
      'Calendar date in YYYY-MM-DD format. The week uses the published timetable weekStartDay when one is available.',
  })
  @ApiOkResponse({ type: TeacherWeeklyScheduleResponseDto })
  getWeeklySchedule(
    @Query() query: TeacherScheduleDateQueryDto,
  ): Promise<TeacherWeeklyScheduleResponseDto> {
    return this.getTeacherWeeklyScheduleUseCase.execute({ date: query.date });
  }
}
