import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import {
  GetHomeworkSubmissionAnswerUseCase,
  ListHomeworkSubmissionAnswersUseCase,
} from '../application/homework-answers.use-cases';
import {
  BulkReviewHomeworkSubmissionAnswersUseCase,
  ReviewHomeworkSubmissionAnswerUseCase,
} from '../application/homework-answer-review.use-cases';
import { ListHomeworkSubmissionAttachmentsUseCase } from '../application/homework-submission-attachments.use-cases';
import {
  BulkReviewHomeworkAnswersDto,
  ReviewHomeworkAnswerDto,
} from '../dto/homework-answer.dto';
import {
  HomeworkAnswerDetailResponseDto,
  HomeworkAnswersListResponseDto,
} from '../dto/homework-answer-response.dto';
import { HomeworkSubmissionAttachmentsListResponseDto } from '../dto/homework-submission-attachment-response.dto';

@ApiTags('Homework')
@ApiBearerAuth()
@Controller('homework/assignments/:homeworkId/submissions/:submissionId')
export class HomeworkSubmissionContentController {
  constructor(
    private readonly listAnswersUseCase: ListHomeworkSubmissionAnswersUseCase,
    private readonly getAnswerUseCase: GetHomeworkSubmissionAnswerUseCase,
    private readonly reviewAnswerUseCase: ReviewHomeworkSubmissionAnswerUseCase,
    private readonly bulkReviewAnswersUseCase: BulkReviewHomeworkSubmissionAnswersUseCase,
    private readonly listAttachmentsUseCase: ListHomeworkSubmissionAttachmentsUseCase,
  ) {}

  @Get('answers')
  @RequiredPermissions('homework.submissions.view')
  @ApiOperation({ summary: 'List homework submission answers' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'submissionId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkAnswersListResponseDto })
  listAnswers(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
  ): Promise<HomeworkAnswersListResponseDto> {
    return this.listAnswersUseCase.execute({ homeworkId, submissionId });
  }

  @Get('answers/:answerId')
  @RequiredPermissions('homework.submissions.view')
  @ApiOperation({ summary: 'Get one homework submission answer' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'submissionId', format: 'uuid' })
  @ApiParam({ name: 'answerId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkAnswerDetailResponseDto })
  getAnswer(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('answerId', new ParseUUIDPipe()) answerId: string,
  ): Promise<HomeworkAnswerDetailResponseDto> {
    return this.getAnswerUseCase.execute({
      homeworkId,
      submissionId,
      answerId,
    });
  }

  @Patch('answers/:answerId/review')
  @RequiredPermissions('homework.assignments.manage')
  @ApiOperation({ summary: 'Review one homework submission answer' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'submissionId', format: 'uuid' })
  @ApiParam({ name: 'answerId', format: 'uuid' })
  @ApiBody({ type: ReviewHomeworkAnswerDto })
  @ApiOkResponse({ type: HomeworkAnswerDetailResponseDto })
  reviewAnswer(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('answerId', new ParseUUIDPipe()) answerId: string,
    @Body() dto: ReviewHomeworkAnswerDto,
  ): Promise<HomeworkAnswerDetailResponseDto> {
    return this.reviewAnswerUseCase.execute({
      homeworkId,
      submissionId,
      answerId,
      review: dto,
    });
  }

  @Put('answers/review')
  @RequiredPermissions('homework.assignments.manage')
  @ApiOperation({ summary: 'Bulk review homework submission answers' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'submissionId', format: 'uuid' })
  @ApiBody({ type: BulkReviewHomeworkAnswersDto })
  @ApiOkResponse({ type: HomeworkAnswersListResponseDto })
  bulkReviewAnswers(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Body() dto: BulkReviewHomeworkAnswersDto,
  ): Promise<HomeworkAnswersListResponseDto> {
    return this.bulkReviewAnswersUseCase.execute({
      homeworkId,
      submissionId,
      reviews: dto.answers,
    });
  }

  @Get('attachments')
  @RequiredPermissions('homework.submissions.view')
  @ApiOperation({ summary: 'List homework submission attachments' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'submissionId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkSubmissionAttachmentsListResponseDto })
  listAttachments(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
  ): Promise<HomeworkSubmissionAttachmentsListResponseDto> {
    return this.listAttachmentsUseCase.execute({ homeworkId, submissionId });
  }
}
