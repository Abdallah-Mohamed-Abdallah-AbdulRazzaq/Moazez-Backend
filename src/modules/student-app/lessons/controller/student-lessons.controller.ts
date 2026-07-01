import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetStudentLessonDetailUseCase } from '../application/get-student-lesson-detail.use-case';
import { GetStudentLessonsTodayUseCase } from '../application/get-student-lessons-today.use-case';
import { GetStudentLessonsWeekUseCase } from '../application/get-student-lessons-week.use-case';
import { StudentLessonsDateQueryDto } from '../dto/student-lessons.dto';
import {
  StudentLessonItemDto,
  StudentLessonsTodayResponseDto,
  StudentLessonsWeekResponseDto,
} from '../dto/student-lessons-response.dto';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/lessons')
export class StudentLessonsController {
  constructor(
    private readonly getTodayUseCase: GetStudentLessonsTodayUseCase,
    private readonly getWeekUseCase: GetStudentLessonsWeekUseCase,
    private readonly getDetailUseCase: GetStudentLessonDetailUseCase,
  ) {}

  @Get('today')
  @ApiOperation({ summary: 'Get visible student lessons for a date' })
  @ApiQuery({
    name: 'date',
    required: true,
    description: 'Calendar date in YYYY-MM-DD format.',
  })
  @ApiOkResponse({ type: StudentLessonsTodayResponseDto })
  @RequiredPermissions('academics.lesson_plans.view')
  getToday(
    @Query() query: StudentLessonsDateQueryDto,
  ): Promise<StudentLessonsTodayResponseDto> {
    return this.getTodayUseCase.execute({ date: query.date });
  }

  @Get('week')
  @ApiOperation({ summary: 'Get visible student lessons for a week' })
  @ApiQuery({
    name: 'date',
    required: true,
    description:
      'Calendar date in YYYY-MM-DD format. The week follows the Student App schedule week convention.',
  })
  @ApiOkResponse({ type: StudentLessonsWeekResponseDto })
  @RequiredPermissions('academics.lesson_plans.view')
  getWeek(
    @Query() query: StudentLessonsDateQueryDto,
  ): Promise<StudentLessonsWeekResponseDto> {
    return this.getWeekUseCase.execute({ date: query.date });
  }

  @Get(':lessonPlanItemId')
  @ApiOperation({ summary: 'Get one visible student lesson' })
  @ApiOkResponse({ type: StudentLessonItemDto })
  @RequiredPermissions('academics.lesson_plans.view')
  getDetail(
    @Param('lessonPlanItemId', new ParseUUIDPipe()) lessonPlanItemId: string,
  ): Promise<StudentLessonItemDto> {
    return this.getDetailUseCase.execute(lessonPlanItemId);
  }
}
