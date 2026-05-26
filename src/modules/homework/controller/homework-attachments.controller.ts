import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
  CreateHomeworkAttachmentUseCase,
  DeleteHomeworkAttachmentUseCase,
  ListHomeworkAttachmentsUseCase,
  ReorderHomeworkAttachmentUseCase,
  UpdateHomeworkAttachmentUseCase,
} from '../application/homework-attachments.use-cases';
import {
  CreateHomeworkAttachmentDto,
  ReorderHomeworkAttachmentDto,
  UpdateHomeworkAttachmentDto,
} from '../dto/homework-attachment.dto';
import {
  HomeworkAttachmentDetailResponseDto,
  HomeworkAttachmentsListResponseDto,
} from '../dto/homework-attachment-response.dto';

@ApiTags('Homework')
@ApiBearerAuth()
@Controller('homework/assignments/:homeworkId/attachments')
export class HomeworkAttachmentsController {
  constructor(
    private readonly listAttachmentsUseCase: ListHomeworkAttachmentsUseCase,
    private readonly createAttachmentUseCase: CreateHomeworkAttachmentUseCase,
    private readonly updateAttachmentUseCase: UpdateHomeworkAttachmentUseCase,
    private readonly reorderAttachmentUseCase: ReorderHomeworkAttachmentUseCase,
    private readonly deleteAttachmentUseCase: DeleteHomeworkAttachmentUseCase,
  ) {}

  @Get()
  @RequiredPermissions('homework.assignments.view')
  @ApiOperation({ summary: 'List homework assignment attachments' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiOkResponse({ type: HomeworkAttachmentsListResponseDto })
  listAttachments(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
  ): Promise<HomeworkAttachmentsListResponseDto> {
    return this.listAttachmentsUseCase.execute(homeworkId);
  }

  @Post()
  @RequiredPermissions('homework.assignments.manage')
  @ApiOperation({ summary: 'Attach an uploaded file to a homework assignment' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiBody({ type: CreateHomeworkAttachmentDto })
  @ApiOkResponse({ type: HomeworkAttachmentDetailResponseDto })
  createAttachment(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Body() dto: CreateHomeworkAttachmentDto,
  ): Promise<HomeworkAttachmentDetailResponseDto> {
    return this.createAttachmentUseCase.execute(homeworkId, dto);
  }

  @Patch(':attachmentId')
  @RequiredPermissions('homework.assignments.manage')
  @ApiOperation({ summary: 'Update a homework assignment attachment' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'attachmentId', format: 'uuid' })
  @ApiBody({ type: UpdateHomeworkAttachmentDto })
  @ApiOkResponse({ type: HomeworkAttachmentDetailResponseDto })
  updateAttachment(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
    @Body() dto: UpdateHomeworkAttachmentDto,
  ): Promise<HomeworkAttachmentDetailResponseDto> {
    return this.updateAttachmentUseCase.execute(homeworkId, attachmentId, dto);
  }

  @Patch(':attachmentId/reorder')
  @RequiredPermissions('homework.assignments.manage')
  @ApiOperation({ summary: 'Reorder a homework assignment attachment' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'attachmentId', format: 'uuid' })
  @ApiBody({ type: ReorderHomeworkAttachmentDto })
  @ApiOkResponse({ type: HomeworkAttachmentDetailResponseDto })
  reorderAttachment(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
    @Body() dto: ReorderHomeworkAttachmentDto,
  ): Promise<HomeworkAttachmentDetailResponseDto> {
    return this.reorderAttachmentUseCase.execute(homeworkId, attachmentId, dto);
  }

  @Delete(':attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiredPermissions('homework.assignments.manage')
  @ApiOperation({ summary: 'Soft delete a homework assignment attachment' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiParam({ name: 'attachmentId', format: 'uuid' })
  deleteAttachment(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
  ): Promise<void> {
    return this.deleteAttachmentUseCase.execute(homeworkId, attachmentId);
  }
}
