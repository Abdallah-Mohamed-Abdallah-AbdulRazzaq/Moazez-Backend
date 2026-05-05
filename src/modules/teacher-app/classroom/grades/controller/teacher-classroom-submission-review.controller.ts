import { Body, Controller, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { BulkReviewTeacherClassroomSubmissionAnswersUseCase } from '../application/bulk-review-teacher-classroom-submission-answers.use-case';
import { FinalizeTeacherClassroomSubmissionReviewUseCase } from '../application/finalize-teacher-classroom-submission-review.use-case';
import { ReviewTeacherClassroomSubmissionAnswerUseCase } from '../application/review-teacher-classroom-submission-answer.use-case';
import { SyncTeacherClassroomSubmissionGradeItemUseCase } from '../application/sync-teacher-classroom-submission-grade-item.use-case';
import {
  BulkReviewGradeSubmissionAnswersDto,
  ReviewGradeSubmissionAnswerDto,
} from '../../../../grades/assessments/dto/grade-submission-review.dto';
import {
  TeacherClassroomBulkSubmissionAnswerReviewResponseDto,
  TeacherClassroomSubmissionAnswerReviewParamsDto,
  TeacherClassroomSubmissionAnswerReviewResponseDto,
  TeacherClassroomSubmissionGradeItemSyncResponseDto,
  TeacherClassroomSubmissionReviewFinalizeResponseDto,
  TeacherClassroomSubmissionReviewParamsDto,
} from '../dto/teacher-classroom-submission-review.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller(
  'teacher/classroom/:classId/assignments/:assignmentId/submissions/:submissionId',
)
export class TeacherClassroomSubmissionReviewController {
  constructor(
    private readonly reviewAnswerUseCase: ReviewTeacherClassroomSubmissionAnswerUseCase,
    private readonly bulkReviewAnswersUseCase: BulkReviewTeacherClassroomSubmissionAnswersUseCase,
    private readonly finalizeReviewUseCase: FinalizeTeacherClassroomSubmissionReviewUseCase,
    private readonly syncGradeItemUseCase: SyncTeacherClassroomSubmissionGradeItemUseCase,
  ) {}

  @Patch('answers/:answerId/review')
  @ApiOkResponse({ type: TeacherClassroomSubmissionAnswerReviewResponseDto })
  reviewAnswer(
    @Param() params: TeacherClassroomSubmissionAnswerReviewParamsDto,
    @Body() body: ReviewGradeSubmissionAnswerDto,
  ): Promise<TeacherClassroomSubmissionAnswerReviewResponseDto> {
    return this.reviewAnswerUseCase.execute(
      params.classId,
      params.assignmentId,
      params.submissionId,
      params.answerId,
      body,
    );
  }

  @Put('answers/review')
  @ApiOkResponse({
    type: TeacherClassroomBulkSubmissionAnswerReviewResponseDto,
  })
  bulkReviewAnswers(
    @Param() params: TeacherClassroomSubmissionReviewParamsDto,
    @Body() body: BulkReviewGradeSubmissionAnswersDto,
  ): Promise<TeacherClassroomBulkSubmissionAnswerReviewResponseDto> {
    return this.bulkReviewAnswersUseCase.execute(
      params.classId,
      params.assignmentId,
      params.submissionId,
      body,
    );
  }

  @Post('review/finalize')
  @ApiOkResponse({ type: TeacherClassroomSubmissionReviewFinalizeResponseDto })
  finalizeReview(
    @Param() params: TeacherClassroomSubmissionReviewParamsDto,
  ): Promise<TeacherClassroomSubmissionReviewFinalizeResponseDto> {
    return this.finalizeReviewUseCase.execute(
      params.classId,
      params.assignmentId,
      params.submissionId,
    );
  }

  @Post('sync-grade-item')
  @ApiOkResponse({ type: TeacherClassroomSubmissionGradeItemSyncResponseDto })
  syncGradeItem(
    @Param() params: TeacherClassroomSubmissionReviewParamsDto,
  ): Promise<TeacherClassroomSubmissionGradeItemSyncResponseDto> {
    return this.syncGradeItemUseCase.execute(
      params.classId,
      params.assignmentId,
      params.submissionId,
    );
  }
}
