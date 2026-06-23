import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import {
  GetHomeworkAssignmentSubmissionUseCase,
  ListHomeworkAssignmentSubmissionsUseCase,
  ReviewHomeworkAssignmentSubmissionUseCase,
} from '../application/homework-submission-review-surface.use-cases';
import {
  HOMEWORK_SUBMISSION_STATUSES,
  HomeworkSubmissionReviewDto,
  ListHomeworkSubmissionsQueryDto,
} from '../dto/homework-submission.dto';
import {
  HomeworkSubmissionResponseDto,
  HomeworkSubmissionsListResponseDto,
} from '../dto/homework-submission-response.dto';

@ApiTags('Homework')
@ApiBearerAuth()
@Controller('homework/assignments/:homeworkId/submissions')
export class HomeworkSubmissionsController {
  constructor(
    private readonly listSubmissionsUseCase: ListHomeworkAssignmentSubmissionsUseCase,
    private readonly getSubmissionUseCase: GetHomeworkAssignmentSubmissionUseCase,
    private readonly reviewSubmissionUseCase: ReviewHomeworkAssignmentSubmissionUseCase,
  ) {}

  @Get()
  @RequiredPermissions('homework.submissions.view')
  @ApiOperation({ summary: 'List homework submissions for review' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: HOMEWORK_SUBMISSION_STATUSES,
  })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse({ type: HomeworkSubmissionsListResponseDto })
  listSubmissions(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Query() query: ListHomeworkSubmissionsQueryDto,
  ): Promise<HomeworkSubmissionsListResponseDto> {
    return this.listSubmissionsUseCase.execute(homeworkId, query);
  }

  @Get(':submissionId')
  @RequiredPermissions('homework.submissions.view')
  @ApiOperation({ summary: 'Get one homework submission for review' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'submissionId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkSubmissionResponseDto })
  getSubmission(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
  ): Promise<HomeworkSubmissionResponseDto> {
    return this.getSubmissionUseCase.execute(homeworkId, submissionId);
  }

  @Post(':submissionId/review')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('homework.assignments.manage')
  @ApiOperation({ summary: 'Review a homework submission' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'submissionId', format: 'uuid' })
  @ApiBody({ type: HomeworkSubmissionReviewDto })
  @ApiOkResponse({ type: HomeworkSubmissionResponseDto })
  reviewSubmission(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Body() dto: HomeworkSubmissionReviewDto,
  ): Promise<HomeworkSubmissionResponseDto> {
    return this.reviewSubmissionUseCase.execute(homeworkId, submissionId, dto);
  }

  @Patch(':submissionId/review')
  @RequiredPermissions('homework.assignments.manage')
  @ApiOperation({ summary: 'Review a homework submission' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'submissionId', format: 'uuid' })
  @ApiBody({ type: HomeworkSubmissionReviewDto })
  @ApiOkResponse({ type: HomeworkSubmissionResponseDto })
  patchReviewSubmission(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Body() dto: HomeworkSubmissionReviewDto,
  ): Promise<HomeworkSubmissionResponseDto> {
    return this.reviewSubmission(homeworkId, submissionId, dto);
  }
}
