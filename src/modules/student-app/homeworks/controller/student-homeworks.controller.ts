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
  Put,
  Query,
  Delete,
} from '@nestjs/common';
import {
  ApiBody,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import {
  GetStudentHomeworkUseCase,
  GetStudentHomeworkSubmissionUseCase,
  ListStudentHomeworkSubmissionAnswersUseCase,
  SaveStudentHomeworkSubmissionAnswerUseCase,
  SaveStudentHomeworkSubmissionAnswersUseCase,
  ListStudentHomeworkSubmissionAttachmentsUseCase,
  CreateStudentHomeworkSubmissionAttachmentUseCase,
  UpdateStudentHomeworkSubmissionAttachmentUseCase,
  ReorderStudentHomeworkSubmissionAttachmentUseCase,
  DeleteStudentHomeworkSubmissionAttachmentUseCase,
  ListStudentHomeworksUseCase,
  SaveStudentHomeworkSubmissionUseCase,
  SubmitStudentHomeworkSubmissionUseCase,
} from '../application/student-homeworks.use-cases';
import {
  BulkSaveHomeworkAnswersDto,
  SaveHomeworkAnswerDto,
} from '../../../homework/dto/homework-answer.dto';
import {
  HomeworkAnswerDetailResponseDto,
  HomeworkAnswersListResponseDto,
} from '../../../homework/dto/homework-answer-response.dto';
import {
  CreateHomeworkSubmissionAttachmentDto,
  ReorderHomeworkSubmissionAttachmentDto,
  UpdateHomeworkSubmissionAttachmentDto,
} from '../../../homework/dto/homework-submission-attachment.dto';
import {
  HomeworkSubmissionAttachmentDetailResponseDto,
  HomeworkSubmissionAttachmentsListResponseDto,
} from '../../../homework/dto/homework-submission-attachment-response.dto';
import {
  StudentHomeworkSubmissionBodyDto,
  StudentHomeworkSubmissionResponseDto,
  StudentHomeworkSubmitBodyDto,
  StudentHomeworkResponseDto,
  StudentHomeworksListResponseDto,
  StudentHomeworksQueryDto,
} from '../dto/student-homeworks.dto';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/homeworks')
export class StudentHomeworksController {
  constructor(
    private readonly listStudentHomeworksUseCase: ListStudentHomeworksUseCase,
    private readonly getStudentHomeworkUseCase: GetStudentHomeworkUseCase,
    private readonly getStudentHomeworkSubmissionUseCase: GetStudentHomeworkSubmissionUseCase,
    private readonly saveStudentHomeworkSubmissionUseCase: SaveStudentHomeworkSubmissionUseCase,
    private readonly submitStudentHomeworkSubmissionUseCase: SubmitStudentHomeworkSubmissionUseCase,
    private readonly listStudentHomeworkSubmissionAnswersUseCase: ListStudentHomeworkSubmissionAnswersUseCase,
    private readonly saveStudentHomeworkSubmissionAnswersUseCase: SaveStudentHomeworkSubmissionAnswersUseCase,
    private readonly saveStudentHomeworkSubmissionAnswerUseCase: SaveStudentHomeworkSubmissionAnswerUseCase,
    private readonly listStudentHomeworkSubmissionAttachmentsUseCase: ListStudentHomeworkSubmissionAttachmentsUseCase,
    private readonly createStudentHomeworkSubmissionAttachmentUseCase: CreateStudentHomeworkSubmissionAttachmentUseCase,
    private readonly updateStudentHomeworkSubmissionAttachmentUseCase: UpdateStudentHomeworkSubmissionAttachmentUseCase,
    private readonly reorderStudentHomeworkSubmissionAttachmentUseCase: ReorderStudentHomeworkSubmissionAttachmentUseCase,
    private readonly deleteStudentHomeworkSubmissionAttachmentUseCase: DeleteStudentHomeworkSubmissionAttachmentUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List homework assigned to the current student' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'mode', required: false })
  @ApiQuery({ name: 'dueFrom', required: false })
  @ApiQuery({ name: 'dueTo', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse({ type: StudentHomeworksListResponseDto })
  @RequiredPermissions('homework.assignments.view')
  listHomeworks(
    @Query() query: StudentHomeworksQueryDto,
  ): Promise<StudentHomeworksListResponseDto> {
    return this.listStudentHomeworksUseCase.execute(query);
  }

  @Get(':homeworkId')
  @ApiOperation({ summary: 'Get assigned homework details' })
  @ApiParam({ name: 'homeworkId' })
  @ApiOkResponse({ type: StudentHomeworkResponseDto })
  @RequiredPermissions('homework.assignments.view')
  getHomework(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
  ): Promise<StudentHomeworkResponseDto> {
    return this.getStudentHomeworkUseCase.execute(homeworkId);
  }

  @Get(':homeworkId/submission')
  @ApiOperation({ summary: 'Get current student homework submission' })
  @ApiParam({ name: 'homeworkId' })
  @ApiOkResponse({ type: StudentHomeworkSubmissionResponseDto })
  @RequiredPermissions('homework.submissions.view')
  getSubmission(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
  ): Promise<StudentHomeworkSubmissionResponseDto> {
    return this.getStudentHomeworkSubmissionUseCase.execute(homeworkId);
  }

  @Put(':homeworkId/submission')
  @ApiOperation({ summary: 'Save current student homework submission draft' })
  @ApiParam({ name: 'homeworkId' })
  @ApiBody({ type: StudentHomeworkSubmissionBodyDto })
  @ApiOkResponse({ type: StudentHomeworkSubmissionResponseDto })
  @RequiredPermissions('homework.submissions.save')
  saveSubmissionDraft(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Body() dto: StudentHomeworkSubmissionBodyDto,
  ): Promise<StudentHomeworkSubmissionResponseDto> {
    return this.saveStudentHomeworkSubmissionUseCase.execute(homeworkId, dto);
  }

  @Post(':homeworkId/submission/draft')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save current student homework submission draft' })
  @ApiParam({ name: 'homeworkId' })
  @ApiBody({ type: StudentHomeworkSubmissionBodyDto })
  @ApiOkResponse({ type: StudentHomeworkSubmissionResponseDto })
  @RequiredPermissions('homework.submissions.save')
  saveSubmissionDraftAlias(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Body() dto: StudentHomeworkSubmissionBodyDto,
  ): Promise<StudentHomeworkSubmissionResponseDto> {
    return this.saveStudentHomeworkSubmissionUseCase.execute(homeworkId, dto);
  }

  @Get(':homeworkId/submission/answers')
  @ApiOperation({ summary: 'List current student homework submission answers' })
  @ApiParam({ name: 'homeworkId' })
  @ApiOkResponse({ type: HomeworkAnswersListResponseDto })
  @RequiredPermissions('homework.submissions.view')
  listSubmissionAnswers(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
  ): Promise<HomeworkAnswersListResponseDto> {
    return this.listStudentHomeworkSubmissionAnswersUseCase.execute(homeworkId);
  }

  @Put(':homeworkId/submission/answers')
  @ApiOperation({ summary: 'Bulk save current student homework answers' })
  @ApiParam({ name: 'homeworkId' })
  @ApiBody({ type: BulkSaveHomeworkAnswersDto })
  @ApiOkResponse({ type: HomeworkAnswersListResponseDto })
  @RequiredPermissions('homework.answers.manage')
  saveSubmissionAnswers(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Body() dto: BulkSaveHomeworkAnswersDto,
  ): Promise<HomeworkAnswersListResponseDto> {
    return this.saveStudentHomeworkSubmissionAnswersUseCase.execute(
      homeworkId,
      dto,
    );
  }

  @Patch(':homeworkId/submission/answers/:questionId')
  @ApiOperation({ summary: 'Save one current student homework answer' })
  @ApiParam({ name: 'homeworkId' })
  @ApiParam({ name: 'questionId' })
  @ApiBody({ type: SaveHomeworkAnswerDto })
  @ApiOkResponse({ type: HomeworkAnswerDetailResponseDto })
  @RequiredPermissions('homework.answers.manage')
  saveSubmissionAnswer(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() dto: SaveHomeworkAnswerDto,
  ): Promise<HomeworkAnswerDetailResponseDto> {
    return this.saveStudentHomeworkSubmissionAnswerUseCase.execute(
      homeworkId,
      questionId,
      dto,
    );
  }

  @Get(':homeworkId/submission/attachments')
  @ApiOperation({
    summary: 'List current student homework submission attachments',
  })
  @ApiParam({ name: 'homeworkId' })
  @ApiOkResponse({ type: HomeworkSubmissionAttachmentsListResponseDto })
  @RequiredPermissions('homework.submissions.view')
  listSubmissionAttachments(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
  ): Promise<HomeworkSubmissionAttachmentsListResponseDto> {
    return this.listStudentHomeworkSubmissionAttachmentsUseCase.execute(
      homeworkId,
    );
  }

  @Post(':homeworkId/submission/attachments')
  @ApiOperation({
    summary: 'Attach an uploaded file to current student homework submission',
  })
  @ApiParam({ name: 'homeworkId' })
  @ApiBody({ type: CreateHomeworkSubmissionAttachmentDto })
  @ApiOkResponse({ type: HomeworkSubmissionAttachmentDetailResponseDto })
  @RequiredPermissions('homework.submission_attachments.manage')
  createSubmissionAttachment(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Body() dto: CreateHomeworkSubmissionAttachmentDto,
  ): Promise<HomeworkSubmissionAttachmentDetailResponseDto> {
    return this.createStudentHomeworkSubmissionAttachmentUseCase.execute(
      homeworkId,
      dto,
    );
  }

  @Patch(':homeworkId/submission/attachments/:attachmentId')
  @ApiOperation({
    summary: 'Update current student homework submission attachment metadata',
  })
  @ApiParam({ name: 'homeworkId' })
  @ApiParam({ name: 'attachmentId' })
  @ApiBody({ type: UpdateHomeworkSubmissionAttachmentDto })
  @ApiOkResponse({ type: HomeworkSubmissionAttachmentDetailResponseDto })
  @RequiredPermissions('homework.submission_attachments.manage')
  updateSubmissionAttachment(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
    @Body() dto: UpdateHomeworkSubmissionAttachmentDto,
  ): Promise<HomeworkSubmissionAttachmentDetailResponseDto> {
    return this.updateStudentHomeworkSubmissionAttachmentUseCase.execute(
      homeworkId,
      attachmentId,
      dto,
    );
  }

  @Patch(':homeworkId/submission/attachments/:attachmentId/reorder')
  @ApiOperation({
    summary: 'Reorder current student homework submission attachment',
  })
  @ApiParam({ name: 'homeworkId' })
  @ApiParam({ name: 'attachmentId' })
  @ApiBody({ type: ReorderHomeworkSubmissionAttachmentDto })
  @ApiOkResponse({ type: HomeworkSubmissionAttachmentDetailResponseDto })
  @RequiredPermissions('homework.submission_attachments.manage')
  reorderSubmissionAttachment(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
    @Body() dto: ReorderHomeworkSubmissionAttachmentDto,
  ): Promise<HomeworkSubmissionAttachmentDetailResponseDto> {
    return this.reorderStudentHomeworkSubmissionAttachmentUseCase.execute(
      homeworkId,
      attachmentId,
      dto,
    );
  }

  @Delete(':homeworkId/submission/attachments/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft delete current student homework submission attachment',
  })
  @ApiParam({ name: 'homeworkId' })
  @ApiParam({ name: 'attachmentId' })
  @RequiredPermissions('homework.submission_attachments.manage')
  deleteSubmissionAttachment(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
  ): Promise<void> {
    return this.deleteStudentHomeworkSubmissionAttachmentUseCase.execute(
      homeworkId,
      attachmentId,
    );
  }

  @Post(':homeworkId/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit current student homework' })
  @ApiParam({ name: 'homeworkId' })
  @ApiBody({ type: StudentHomeworkSubmitBodyDto })
  @ApiOkResponse({ type: StudentHomeworkSubmissionResponseDto })
  @RequiredPermissions('homework.submissions.submit')
  submitHomework(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Body() dto: StudentHomeworkSubmitBodyDto,
  ): Promise<StudentHomeworkSubmissionResponseDto> {
    return this.submitStudentHomeworkSubmissionUseCase.execute(homeworkId, dto);
  }

  @Post(':homeworkId/submission/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit current student homework' })
  @ApiParam({ name: 'homeworkId' })
  @ApiBody({ type: StudentHomeworkSubmitBodyDto })
  @ApiOkResponse({ type: StudentHomeworkSubmissionResponseDto })
  @RequiredPermissions('homework.submissions.submit')
  submitHomeworkAlias(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Body() dto: StudentHomeworkSubmitBodyDto,
  ): Promise<StudentHomeworkSubmissionResponseDto> {
    return this.submitStudentHomeworkSubmissionUseCase.execute(homeworkId, dto);
  }
}
