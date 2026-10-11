import type { Request, Response } from 'express';
import { Req, Res, ParseUUIDPipe } from '@nestjs/common';
import {
  privateMediaContentRequest,
  streamPrivateMediaContent,
} from '../../../../../infrastructure/storage/private-media-content.response';
import { GetTeacherTaskProofContentUseCase } from '../application/get-teacher-task-proof-content.use-case';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../../common/decorators/required-permissions.decorator';
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
    private readonly content: GetTeacherTaskProofContentUseCase,
    private readonly listTeacherTaskReviewQueueUseCase: ListTeacherTaskReviewQueueUseCase,
    private readonly getTeacherTaskReviewSubmissionUseCase: GetTeacherTaskReviewSubmissionUseCase,
    private readonly approveTeacherTaskReviewSubmissionUseCase: ApproveTeacherTaskReviewSubmissionUseCase,
    private readonly rejectTeacherTaskReviewSubmissionUseCase: RejectTeacherTaskReviewSubmissionUseCase,
  ) {}

  @Get()
  @RequiredPermissions('reinforcement.reviews.view')
  @ApiOkResponse({ type: TeacherTaskReviewQueueResponseDto })
  listReviewQueue(
    @Query() query: ListTeacherTaskReviewQueueQueryDto,
  ): Promise<TeacherTaskReviewQueueResponseDto> {
    return this.listTeacherTaskReviewQueueUseCase.execute(query);
  }

  @Get(':submissionId')
  @RequiredPermissions('reinforcement.reviews.view')
  @ApiOkResponse({ type: TeacherTaskReviewSubmissionResponseDto })
  getReviewSubmission(
    @Param() params: TeacherTaskReviewSubmissionParamsDto,
  ): Promise<TeacherTaskReviewSubmissionResponseDto> {
    return this.getTeacherTaskReviewSubmissionUseCase.execute(
      params.submissionId,
    );
  }

  @Post(':submissionId/approve')
  @RequiredPermissions('reinforcement.reviews.manage')
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
  @RequiredPermissions('reinforcement.reviews.manage')
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
  @Get(':submissionId/files/:fileId/download/content')
  @RequiredPermissions('reinforcement.reviews.view')
  async fileContent(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.content.execute(
      submissionId,
      fileId,
      privateMediaContentRequest(request, response, 'attachment'),
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
}
