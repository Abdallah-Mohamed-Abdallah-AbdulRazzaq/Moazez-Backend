import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { GetTeacherLessonPreparationDetailUseCase } from '../application/get-teacher-lesson-preparation-detail.use-case';
import { GetTeacherLessonPreparationTodayUseCase } from '../application/get-teacher-lesson-preparation-today.use-case';
import { GetTeacherLessonPreparationWeekUseCase } from '../application/get-teacher-lesson-preparation-week.use-case';
import { UpdateTeacherLessonPreparationStatusUseCase } from '../application/update-teacher-lesson-preparation-status.use-case';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import {
  TeacherLessonPreparationDateQueryDto,
  UpdateTeacherLessonPreparationStatusDto,
} from '../dto/teacher-lesson-preparation.dto';
import {
  TeacherLessonPreparationItemDto,
  TeacherLessonPreparationTodayResponseDto,
  TeacherLessonPreparationWeekResponseDto,
} from '../dto/teacher-lesson-preparation-response.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher/lesson-preparation')
export class TeacherLessonPreparationController {
  constructor(
    private readonly getTodayUseCase: GetTeacherLessonPreparationTodayUseCase,
    private readonly getWeekUseCase: GetTeacherLessonPreparationWeekUseCase,
    private readonly getDetailUseCase: GetTeacherLessonPreparationDetailUseCase,
    private readonly updateStatusUseCase: UpdateTeacherLessonPreparationStatusUseCase,
  ) {}

  @Get('today')
  @RequiredPermissions(
    'teacher.lesson_preparation.view',
    'academics.lesson_plans.view',
  )
  @ApiOperation({ summary: 'Get teacher lesson-preparation items for a date' })
  @ApiQuery({
    name: 'date',
    required: true,
    description: 'Calendar date in YYYY-MM-DD format.',
  })
  @ApiOkResponse({ type: TeacherLessonPreparationTodayResponseDto })
  getToday(
    @Query() query: TeacherLessonPreparationDateQueryDto,
  ): Promise<TeacherLessonPreparationTodayResponseDto> {
    return this.getTodayUseCase.execute({ date: query.date });
  }

  @Get('week')
  @RequiredPermissions(
    'teacher.lesson_preparation.view',
    'academics.lesson_plans.view',
  )
  @ApiOperation({ summary: 'Get teacher lesson-preparation items for a week' })
  @ApiQuery({
    name: 'date',
    required: true,
    description:
      'Calendar date in YYYY-MM-DD format. The week follows the Teacher App schedule week convention.',
  })
  @ApiOkResponse({ type: TeacherLessonPreparationWeekResponseDto })
  getWeek(
    @Query() query: TeacherLessonPreparationDateQueryDto,
  ): Promise<TeacherLessonPreparationWeekResponseDto> {
    return this.getWeekUseCase.execute({ date: query.date });
  }

  @Get(':lessonPlanItemId')
  @RequiredPermissions(
    'teacher.lesson_preparation.view',
    'academics.lesson_plans.view',
    'academics.curriculum.view',
  )
  @ApiOperation({ summary: 'Get one teacher-owned lesson-preparation item' })
  @ApiOkResponse({ type: TeacherLessonPreparationItemDto })
  getDetail(
    @Param('lessonPlanItemId', new ParseUUIDPipe()) lessonPlanItemId: string,
  ): Promise<TeacherLessonPreparationItemDto> {
    return this.getDetailUseCase.execute(lessonPlanItemId);
  }

  @Patch(':lessonPlanItemId/status')
  @ApiOperation({ summary: 'Update a teacher-owned lesson-preparation status' })
  @ApiOkResponse({ type: TeacherLessonPreparationItemDto })
  updateStatus(
    @Param('lessonPlanItemId', new ParseUUIDPipe()) lessonPlanItemId: string,
    @Body() body: UpdateTeacherLessonPreparationStatusDto,
  ): Promise<TeacherLessonPreparationItemDto> {
    return this.updateStatusUseCase.execute(lessonPlanItemId, body);
  }
}
