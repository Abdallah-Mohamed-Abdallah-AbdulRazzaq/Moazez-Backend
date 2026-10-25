import {
  Body,
  Controller,
  Delete,
  Get,
  Head,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import {
  privateMediaContentRequest,
  streamPrivateMediaContent,
} from '../../../../infrastructure/storage/private-media-content.response';
import { TeacherHomeworkQuestionAssetsService } from '../application/teacher-homework-question-assets.service';
import {
  CreateHomeworkQuestionAssetDto,
  UpdateHomeworkQuestionAssetDto,
  ReorderHomeworkQuestionAssetDto,
  HomeworkQuestionAssetResponseDto,
  HomeworkQuestionAssetsResponseDto,
} from '../../../homework/dto/homework-question-asset.dto';

@ApiTags('teacher-homework-question-assets')
@ApiBearerAuth()
@ApiParam({ name: 'classId', format: 'uuid' })
@ApiParam({ name: 'homeworkId', format: 'uuid' })
@ApiParam({ name: 'questionId', format: 'uuid' })
@Controller(
  'teacher/homeworks/classes/:classId/assignments/:homeworkId/questions/:questionId/assets',
)
export class TeacherHomeworkQuestionAssetsController {
  constructor(private readonly assets: TeacherHomeworkQuestionAssetsService) {}

  @Get()
  @RequiredPermissions('homework.questions.view')
  @ApiOperation({ summary: 'List assets of the exact owned Homework question' })
  @ApiOkResponse({ type: HomeworkQuestionAssetsResponseDto })
  list(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ) {
    return this.assets.list({ classId, homeworkId, questionId });
  }

  @Get(':assetId')
  @RequiredPermissions('homework.questions.view')
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({ summary: 'Get one exact Homework question asset' })
  @ApiOkResponse({ type: HomeworkQuestionAssetResponseDto })
  get(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
  ) {
    return this.assets.get({ classId, homeworkId, questionId, assetId });
  }

  @Post()
  @RequiredPermissions('homework.questions.manage')
  @ApiOperation({
    summary:
      'Bind a verified managed File or safe HTTPS reference in DRAFT Homework',
  })
  @ApiBody({ type: CreateHomeworkQuestionAssetDto })
  @ApiCreatedResponse({ type: HomeworkQuestionAssetResponseDto })
  create(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() dto: CreateHomeworkQuestionAssetDto,
  ) {
    return this.assets.create({ classId, homeworkId, questionId }, dto);
  }

  @Patch(':assetId')
  @RequiredPermissions('homework.questions.manage')
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({
    summary:
      'Update DRAFT asset display metadata; source identity is immutable',
  })
  @ApiBody({ type: UpdateHomeworkQuestionAssetDto })
  @ApiOkResponse({ type: HomeworkQuestionAssetResponseDto })
  update(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Body() dto: UpdateHomeworkQuestionAssetDto,
  ) {
    return this.assets.update(
      { classId, homeworkId, questionId, assetId },
      dto,
    );
  }

  @Patch(':assetId/reorder')
  @RequiredPermissions('homework.questions.manage')
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({
    summary:
      'Set a nonnegative DRAFT asset sort order; stable ties are allowed',
  })
  @ApiBody({ type: ReorderHomeworkQuestionAssetDto })
  @ApiOkResponse({ type: HomeworkQuestionAssetResponseDto })
  reorder(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Body() dto: ReorderHomeworkQuestionAssetDto,
  ) {
    return this.assets.reorder(
      { classId, homeworkId, questionId, assetId },
      dto,
    );
  }

  @Delete(':assetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiredPermissions('homework.questions.manage')
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({
    summary: 'Soft-delete a DRAFT asset while preserving File retention',
  })
  @ApiNoContentResponse()
  remove(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
  ) {
    return this.assets.remove({ classId, homeworkId, questionId, assetId });
  }

  @Get(':assetId/preview')
  @RequiredPermissions('homework.questions.view')
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({ summary: 'GET authorized private question asset preview' })
  @ApiHeader({ name: 'Range', required: false })
  @ApiHeader({ name: 'If-Range', required: false })
  @ApiOkResponse({ description: 'Private no-store content; HEAD has no body' })
  @ApiResponse({ status: 206, description: 'Single byte range' })
  @ApiResponse({
    status: 416,
    description: 'Invalid or unsatisfiable byte range',
  })
  async getPreview(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      { classId, homeworkId, questionId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }

  @Head(':assetId/preview')
  @RequiredPermissions('homework.questions.view')
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({ summary: 'HEAD authorized private question asset preview' })
  @ApiHeader({ name: 'Range', required: false })
  @ApiHeader({ name: 'If-Range', required: false })
  @ApiOkResponse({ description: 'Private no-store content; HEAD has no body' })
  @ApiResponse({ status: 206, description: 'Single byte range' })
  @ApiResponse({
    status: 416,
    description: 'Invalid or unsatisfiable byte range',
  })
  async headPreview(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      { classId, homeworkId, questionId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }

  @Get(':assetId/download')
  @RequiredPermissions('homework.questions.view')
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({ summary: 'GET authorized private question asset download' })
  @ApiHeader({ name: 'Range', required: false })
  @ApiHeader({ name: 'If-Range', required: false })
  @ApiOkResponse({ description: 'Private no-store content; HEAD has no body' })
  @ApiResponse({ status: 206, description: 'Single byte range' })
  @ApiResponse({
    status: 416,
    description: 'Invalid or unsatisfiable byte range',
  })
  async getDownload(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      { classId, homeworkId, questionId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }

  @Head(':assetId/download')
  @RequiredPermissions('homework.questions.view')
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({ summary: 'HEAD authorized private question asset download' })
  @ApiHeader({ name: 'Range', required: false })
  @ApiHeader({ name: 'If-Range', required: false })
  @ApiOkResponse({ description: 'Private no-store content; HEAD has no body' })
  @ApiResponse({ status: 206, description: 'Single byte range' })
  @ApiResponse({
    status: 416,
    description: 'Invalid or unsatisfiable byte range',
  })
  async headDownload(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      { classId, homeworkId, questionId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
}
