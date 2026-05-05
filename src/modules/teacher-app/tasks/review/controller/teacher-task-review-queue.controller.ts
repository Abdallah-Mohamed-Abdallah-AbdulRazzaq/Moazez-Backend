import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApproveTeacherTaskReviewSubmissionUseCase } from '../application/approve-teacher-task-review-submission.use-case';
import { GetTeacherTaskReviewSubmissionUseCase } from '../application/get-teacher-task-review-submission.use-case';
import { ListTeacherTaskReviewQueueUseCase } from '../application/list-teacher-task-review-queue.use-case';
import { RejectTeacherTaskReviewSubmissionUseCase } from '../application/reject-teacher-task-review-submission.use-case';
import {
  ApproveTeacherTaskReviewSubmissionDto,
  ListTeacherTaskReviewQueueQueryDto,
  RejectTeacherTaskReviewSubmissionDto,
  TeacherTaskReviewQueueResponseDto,
  TeacherTaskReviewSubmissionParamsDto,
  TeacherTaskReviewSubmissionResponseDto,
} from '../dto/teacher-task-review-queue.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher/tasks/review-queue')
export class TeacherTaskReviewQueueController {
  constructor(
    private readonly listTeacherTaskReviewQueueUseCase: ListTeacherTaskReviewQueueUseCase,
    private readonly getTeacherTaskReviewSubmissionUseCase: GetTeacherTaskReviewSubmissionUseCase,
    private readonly approveTeacherTaskReviewSubmissionUseCase: ApproveTeacherTaskReviewSubmissionUseCase,
    private readonly rejectTeacherTaskReviewSubmissionUseCase: RejectTeacherTaskReviewSubmissionUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: TeacherTaskReviewQueueResponseDto })
  listReviewQueue(
    @Query() query: ListTeacherTaskReviewQueueQueryDto,
  ): Promise<TeacherTaskReviewQueueResponseDto> {
    return this.listTeacherTaskReviewQueueUseCase.execute(query);
  }

  @Get(':submissionId')
  @ApiOkResponse({ type: TeacherTaskReviewSubmissionResponseDto })
  getReviewSubmission(
    @Param() params: TeacherTaskReviewSubmissionParamsDto,
  ): Promise<TeacherTaskReviewSubmissionResponseDto> {
    return this.getTeacherTaskReviewSubmissionUseCase.execute(
      params.submissionId,
    );
  }

  @Post(':submissionId/approve')
  @ApiOkResponse({ type: TeacherTaskReviewSubmissionResponseDto })
  approveReviewSubmission(
    @Param() params: TeacherTaskReviewSubmissionParamsDto,
    @Body() dto: ApproveTeacherTaskReviewSubmissionDto,
  ): Promise<TeacherTaskReviewSubmissionResponseDto> {
    return this.approveTeacherTaskReviewSubmissionUseCase.execute(
      params.submissionId,
      dto,
    );
  }

  @Post(':submissionId/reject')
  @ApiOkResponse({ type: TeacherTaskReviewSubmissionResponseDto })
  rejectReviewSubmission(
    @Param() params: TeacherTaskReviewSubmissionParamsDto,
    @Body() dto: RejectTeacherTaskReviewSubmissionDto,
  ): Promise<TeacherTaskReviewSubmissionResponseDto> {
    return this.rejectTeacherTaskReviewSubmissionUseCase.execute(
      params.submissionId,
      dto,
    );
  }
}
