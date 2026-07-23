import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetStudentLessonPlaybackUseCase } from '../application/get-student-lesson-playback.use-case';
import { StudentLessonPlaybackResponseDto } from '../dto/student-lesson-playback-response.dto';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/lessons/:lessonPlanItemId/content')
export class StudentLessonPlaybackController {
  constructor(
    private readonly getPlaybackUseCase: GetStudentLessonPlaybackUseCase,
  ) {}

  @Get(':contentItemId/playback')
  @ApiOperation({ summary: 'Get a secure student lesson video playback URL' })
  @ApiOkResponse({ type: StudentLessonPlaybackResponseDto })
  @RequiredPermissions('academics.lesson_plans.view')
  getPlayback(
    @Param('lessonPlanItemId', new ParseUUIDPipe()) lessonPlanItemId: string,
    @Param('contentItemId', new ParseUUIDPipe()) contentItemId: string,
  ): Promise<StudentLessonPlaybackResponseDto> {
    return this.getPlaybackUseCase.execute({ lessonPlanItemId, contentItemId });
  }
}
