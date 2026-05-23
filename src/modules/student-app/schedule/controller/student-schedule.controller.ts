import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { GetStudentDailyScheduleUseCase } from '../application/get-student-daily-schedule.use-case';
import { GetStudentWeeklyScheduleUseCase } from '../application/get-student-weekly-schedule.use-case';
import {
  StudentDailyScheduleResponseDto,
  StudentScheduleDateQueryDto,
  StudentWeeklyScheduleResponseDto,
} from '../dto/student-schedule.dto';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/schedule')
export class StudentScheduleController {
  constructor(
    private readonly getStudentDailyScheduleUseCase: GetStudentDailyScheduleUseCase,
    private readonly getStudentWeeklyScheduleUseCase: GetStudentWeeklyScheduleUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get the current student daily schedule' })
  @ApiQuery({
    name: 'date',
    required: true,
    description: 'Calendar date in YYYY-MM-DD format.',
  })
  @ApiOkResponse({ type: StudentDailyScheduleResponseDto })
  getDailySchedule(
    @Query() query: StudentScheduleDateQueryDto,
  ): Promise<StudentDailyScheduleResponseDto> {
    return this.getStudentDailyScheduleUseCase.execute({ date: query.date });
  }

  @Get('week')
  @ApiOperation({ summary: 'Get the current student weekly schedule' })
  @ApiQuery({
    name: 'date',
    required: true,
    description:
      'Calendar date in YYYY-MM-DD format. The week uses the published timetable weekStartDay when one is available.',
  })
  @ApiOkResponse({ type: StudentWeeklyScheduleResponseDto })
  getWeeklySchedule(
    @Query() query: StudentScheduleDateQueryDto,
  ): Promise<StudentWeeklyScheduleResponseDto> {
    return this.getStudentWeeklyScheduleUseCase.execute({ date: query.date });
  }
}
