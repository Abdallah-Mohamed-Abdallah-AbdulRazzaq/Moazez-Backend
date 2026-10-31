import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../../common/decorators/required-permissions.decorator';
import { answerMediaSurfaceGuard } from '../../../../files/assessment-media/application/answer-media-surface.guard';
import { GradeReviewService } from '../../../../grades/assessments/application/grade-review.service';
import {
  ApplyGradeScoringSuggestionDto,
  GradeScoringSuggestionResponseDto,
} from '../../../../grades/assessments/dto/grade-review.dto';
@ApiTags('grades-scoring')
@ApiBearerAuth()
@UseGuards(answerMediaSurfaceGuard('TEACHER'))
@RequiredPermissions('grades.submissions.review')
@Controller(
  'teacher/classroom/:classId/grades/assessments/:assessmentId/submissions/:submissionId/answers/:answerId/scoring',
)
export class TeacherGradeScoringController {
  constructor(private readonly reviews: GradeReviewService) {}
  @Post('suggestions')
  @Header('Cache-Control', 'private, no-store')
  @ApiCreatedResponse({ type: GradeScoringSuggestionResponseDto })
  evaluate(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('answerId', new ParseUUIDPipe()) answerId: string,
  ) {
    return this.reviews.evaluate(
      { surface: 'teacher', classId },
      { assessmentId, submissionId, answerId },
    );
  }
  @Get('suggestions/:suggestionId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: GradeScoringSuggestionResponseDto })
  suggestion(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('answerId', new ParseUUIDPipe()) answerId: string,
    @Param('suggestionId', new ParseUUIDPipe()) suggestionId: string,
  ) {
    return this.reviews.suggestion(
      { surface: 'teacher', classId },
      { assessmentId, submissionId, answerId },
      suggestionId,
    );
  }
  @Post('suggestions/:suggestionId/apply')
  @Header('Cache-Control', 'private, no-store')
  @ApiCreatedResponse({ type: GradeScoringSuggestionResponseDto })
  apply(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('answerId', new ParseUUIDPipe()) answerId: string,
    @Param('suggestionId', new ParseUUIDPipe()) suggestionId: string,
    @Body() command: ApplyGradeScoringSuggestionDto,
  ) {
    return this.reviews.apply(
      { surface: 'teacher', classId },
      { assessmentId, submissionId, answerId },
      suggestionId,
      command,
    );
  }
}
