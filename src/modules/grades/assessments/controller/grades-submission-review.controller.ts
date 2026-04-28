import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { BulkReviewGradeSubmissionAnswersUseCase } from '../application/bulk-review-grade-submission-answers.use-case';
import { FinalizeGradeSubmissionReviewUseCase } from '../application/finalize-grade-submission-review.use-case';
import { ReviewGradeSubmissionAnswerUseCase } from '../application/review-grade-submission-answer.use-case';
import { SyncGradeSubmissionToGradeItemUseCase } from '../application/sync-grade-submission-to-grade-item.use-case';
import {
  BulkReviewGradeSubmissionAnswersDto,
  BulkReviewGradeSubmissionAnswersResponseDto,
  ReviewGradeSubmissionAnswerDto,
} from '../dto/grade-submission-review.dto';
import { GradeSubmissionGradeItemSyncResponseDto } from '../dto/grade-submission-grade-item-sync.dto';
import {
  GradeSubmissionAnswerResponseDto,
  GradeSubmissionResponseDto,
} from '../dto/grade-submission.dto';

@ApiTags('grades-submission-review')
@ApiBearerAuth()
@Controller('grades')
export class GradesSubmissionReviewController {
  constructor(
    private readonly reviewAnswerUseCase: ReviewGradeSubmissionAnswerUseCase,
    private readonly bulkReviewAnswersUseCase: BulkReviewGradeSubmissionAnswersUseCase,
    private readonly finalizeReviewUseCase: FinalizeGradeSubmissionReviewUseCase,
    private readonly syncGradeItemUseCase: SyncGradeSubmissionToGradeItemUseCase,
  ) {}

  @Patch('submissions/:submissionId/answers/:answerId/review')
  @RequiredPermissions('grades.submissions.review')
  reviewAnswer(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('answerId', new ParseUUIDPipe()) answerId: string,
    @Body() dto: ReviewGradeSubmissionAnswerDto,
  ): Promise<GradeSubmissionAnswerResponseDto> {
    return this.reviewAnswerUseCase.execute(submissionId, answerId, dto);
  }

  @Put('submissions/:submissionId/answers/review')
  @RequiredPermissions('grades.submissions.review')
  bulkReviewAnswers(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Body() dto: BulkReviewGradeSubmissionAnswersDto,
  ): Promise<BulkReviewGradeSubmissionAnswersResponseDto> {
    return this.bulkReviewAnswersUseCase.execute(submissionId, dto);
  }

  @Post('submissions/:submissionId/review/finalize')
  @RequiredPermissions('grades.submissions.review')
  finalizeReview(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
  ): Promise<GradeSubmissionResponseDto> {
    return this.finalizeReviewUseCase.execute(submissionId);
  }

  @Post('submissions/:submissionId/sync-grade-item')
  @RequiredPermissions('grades.submissions.review')
  syncGradeItem(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
  ): Promise<GradeSubmissionGradeItemSyncResponseDto> {
    return this.syncGradeItemUseCase.execute(submissionId);
  }
}
