import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { ApproveReinforcementSubmissionUseCase } from '../application/approve-reinforcement-submission.use-case';
import { GetReinforcementReviewItemUseCase } from '../application/get-reinforcement-review-item.use-case';
import { ListReinforcementReviewQueueUseCase } from '../application/list-reinforcement-review-queue.use-case';
import { RejectReinforcementSubmissionUseCase } from '../application/reject-reinforcement-submission.use-case';
import { SubmitReinforcementStageUseCase } from '../application/submit-reinforcement-stage.use-case';
import {
  ListReinforcementReviewQueueQueryDto,
  ReviewReinforcementSubmissionDto,
  SubmitReinforcementStageDto,
} from '../dto/reinforcement-review.dto';

@ApiTags('reinforcement-reviews')
@ApiBearerAuth()
@Controller('reinforcement')
export class ReinforcementReviewsController {
  constructor(
    private readonly submitReinforcementStageUseCase: SubmitReinforcementStageUseCase,
    private readonly listReinforcementReviewQueueUseCase: ListReinforcementReviewQueueUseCase,
    private readonly getReinforcementReviewItemUseCase: GetReinforcementReviewItemUseCase,
    private readonly approveReinforcementSubmissionUseCase: ApproveReinforcementSubmissionUseCase,
    private readonly rejectReinforcementSubmissionUseCase: RejectReinforcementSubmissionUseCase,
  ) {}

  @Post('assignments/:assignmentId/stages/:stageId/submit')
  @RequiredPermissions('reinforcement.tasks.manage')
  submitStage(
    @Param('assignmentId', new ParseUUIDPipe()) assignmentId: string,
    @Param('stageId', new ParseUUIDPipe()) stageId: string,
    @Body() dto: SubmitReinforcementStageDto,
  ) {
    return this.submitReinforcementStageUseCase.execute(
      assignmentId,
      stageId,
      dto,
    );
  }

  @Get('review-queue')
  @RequiredPermissions('reinforcement.reviews.view')
  listReviewQueue(@Query() query: ListReinforcementReviewQueueQueryDto) {
    return this.listReinforcementReviewQueueUseCase.execute(query);
  }

  @Get('review-queue/:submissionId')
  @RequiredPermissions('reinforcement.reviews.view')
  getReviewItem(@Param('submissionId', new ParseUUIDPipe()) submissionId: string) {
    return this.getReinforcementReviewItemUseCase.execute(submissionId);
  }

  @Post('review-queue/:submissionId/approve')
  @RequiredPermissions('reinforcement.reviews.manage')
  approveSubmission(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Body() dto: ReviewReinforcementSubmissionDto,
  ) {
    return this.approveReinforcementSubmissionUseCase.execute(submissionId, dto);
  }

  @Post('review-queue/:submissionId/reject')
  @RequiredPermissions('reinforcement.reviews.manage')
  rejectSubmission(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Body() dto: ReviewReinforcementSubmissionDto,
  ) {
    return this.rejectReinforcementSubmissionUseCase.execute(submissionId, dto);
  }
}
