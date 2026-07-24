import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetParentChildLessonDetailUseCase } from '../application/get-parent-child-lesson-detail.use-case';
import { GetParentChildLessonPlaybackUseCase } from '../application/get-parent-child-lesson-playback.use-case';
import { GetParentChildLessonsTodayUseCase } from '../application/get-parent-child-lessons-today.use-case';
import { GetParentChildLessonsWeekUseCase } from '../application/get-parent-child-lessons-week.use-case';
import { LessonContentPlaybackResponseDto } from '../../../academics/curriculum/app-facing/lesson-content-playback/lesson-content-playback-response.dto';
import { ParentChildLessonsDateQueryDto } from '../dto/parent-child-lessons.dto';
import {
  ParentChildLessonItemDto,
  ParentChildLessonsTodayResponseDto,
  ParentChildLessonsWeekResponseDto,
} from '../dto/parent-child-lessons-response.dto';

@ApiTags('parent-app')
@ApiBearerAuth()
@Controller('parent/children/:studentId/lessons')
export class ParentChildLessonsController {
  constructor(
    private readonly getTodayUseCase: GetParentChildLessonsTodayUseCase,
    private readonly getWeekUseCase: GetParentChildLessonsWeekUseCase,
    private readonly getDetailUseCase: GetParentChildLessonDetailUseCase,
    private readonly getPlaybackUseCase: GetParentChildLessonPlaybackUseCase,
  ) {}

  @Get('today')
  @ApiOperation({ summary: 'Get visible lessons for an owned child on a date' })
  @ApiParam({ name: 'studentId', description: 'Owned child student id.' })
  @ApiQuery({
    name: 'date',
    required: true,
    description: 'Calendar date in YYYY-MM-DD format.',
  })
  @ApiOkResponse({ type: ParentChildLessonsTodayResponseDto })
  @RequiredPermissions(
    'academics.lesson_plans.view',
    'academics.curriculum.view',
  )
  getToday(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: ParentChildLessonsDateQueryDto,
  ): Promise<ParentChildLessonsTodayResponseDto> {
    return this.getTodayUseCase.execute({ studentId, date: query.date });
  }

  @Get('week')
  @ApiOperation({ summary: 'Get visible lessons for an owned child week' })
  @ApiParam({ name: 'studentId', description: 'Owned child student id.' })
  @ApiQuery({
    name: 'date',
    required: true,
    description:
      'Calendar date in YYYY-MM-DD format. The week follows the Parent App schedule week convention.',
  })
  @ApiOkResponse({ type: ParentChildLessonsWeekResponseDto })
  @RequiredPermissions(
    'academics.lesson_plans.view',
    'academics.curriculum.view',
    'academics.timetable.view',
  )
  getWeek(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: ParentChildLessonsDateQueryDto,
  ): Promise<ParentChildLessonsWeekResponseDto> {
    return this.getWeekUseCase.execute({ studentId, date: query.date });
  }

  @Get(':lessonPlanItemId')
  @ApiOperation({ summary: 'Get one visible lesson for an owned child' })
  @ApiParam({ name: 'studentId', description: 'Owned child student id.' })
  @ApiOkResponse({ type: ParentChildLessonItemDto })
  @RequiredPermissions(
    'academics.lesson_plans.view',
    'academics.curriculum.view',
  )
  getDetail(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('lessonPlanItemId', new ParseUUIDPipe()) lessonPlanItemId: string,
  ): Promise<ParentChildLessonItemDto> {
    return this.getDetailUseCase.execute({ studentId, lessonPlanItemId });
  }

  @Get(':lessonPlanItemId/content/:contentItemId/playback')
  @ApiOperation({ summary: 'Get secure playback for an owned child lesson' })
  @ApiParam({ name: 'studentId', description: 'Owned child student id.' })
  @ApiOkResponse({ type: LessonContentPlaybackResponseDto })
  @RequiredPermissions(
    'academics.lesson_plans.view',
    'academics.curriculum.view',
  )
  getPlayback(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('lessonPlanItemId', new ParseUUIDPipe()) lessonPlanItemId: string,
    @Param('contentItemId', new ParseUUIDPipe()) contentItemId: string,
  ): Promise<LessonContentPlaybackResponseDto> {
    return this.getPlaybackUseCase.execute({
      studentId,
      lessonPlanItemId,
      contentItemId,
    });
  }
}
