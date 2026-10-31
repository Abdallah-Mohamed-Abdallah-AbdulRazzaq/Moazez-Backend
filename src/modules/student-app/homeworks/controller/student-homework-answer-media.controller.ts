import {
  Body,
  Controller,
  Delete,
  Get,
  Head,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiHeader,
  ApiResponse,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import {
  privateMediaContentRequest,
  streamPrivateMediaContent,
} from '../../../../infrastructure/storage/private-media-content.response';
import { answerMediaSurfaceGuard } from '../../../files/assessment-media/application/answer-media-surface.guard';
import {
  BindAnswerUploadDto,
  CreateAnswerUploadDto,
  AnswerMediaUploadResponseDto,
  AnswerMediaAssetResponseDto,
  AnswerMediaAssetsResponseDto,
} from '../../../files/assessment-media/dto/answer-media.dto';
import { HomeworkAnswerMediaService } from '../../../homework/application/homework-answer-media.service';

@ApiTags('student-homework-answer-media')
@ApiBearerAuth()
@UseGuards(answerMediaSurfaceGuard('STUDENT'))
@ApiParam({ name: 'homeworkId', format: 'uuid' })
@ApiParam({ name: 'questionId', format: 'uuid' })
@Controller('student/homeworks/:homeworkId/questions/:questionId')
export class StudentHomeworkAnswerMediaController {
  constructor(private readonly media: HomeworkAnswerMediaService) {}
  @Get('answer-assets')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'List authorized answer assets' })
  @ApiResponse({
    status: 404,
    description: 'Resource unavailable or unauthorized',
  })
  @ApiResponse({
    status: 409,
    description: 'State, policy, capacity or immutable identity conflict',
  })
  @ApiOkResponse({ type: AnswerMediaAssetsResponseDto })
  @RequiredPermissions('homework.submissions.view')
  list(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ) {
    return this.media.list(undefined, { homeworkId, questionId });
  }
  @Post('answer-uploads')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Operate the exact immutable question upload' })
  @ApiResponse({
    status: 404,
    description: 'Resource unavailable or unauthorized',
  })
  @ApiResponse({
    status: 409,
    description: 'State, policy, capacity or immutable identity conflict',
  })
  @ApiCreatedResponse({ type: AnswerMediaUploadResponseDto })
  @RequiredPermissions('homework.submission_attachments.manage')
  create(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() dto: CreateAnswerUploadDto,
    @Req() req: Request,
  ) {
    return this.media.create(
      { homeworkId, questionId },
      dto,
      req.headers.origin,
    );
  }
  @Get('answer-uploads/:uploadId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Operate the exact immutable question upload' })
  @ApiResponse({
    status: 404,
    description: 'Resource unavailable or unauthorized',
  })
  @ApiResponse({
    status: 409,
    description: 'State, policy, capacity or immutable identity conflict',
  })
  @ApiParam({ name: 'uploadId', format: 'uuid' })
  @ApiOkResponse({ type: AnswerMediaUploadResponseDto })
  @RequiredPermissions('homework.submission_attachments.manage')
  status(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ) {
    return this.media.upload({ homeworkId, questionId }, uploadId, 'status');
  }
  @Post('answer-uploads/:uploadId/complete')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Operate the exact immutable question upload' })
  @ApiResponse({
    status: 404,
    description: 'Resource unavailable or unauthorized',
  })
  @ApiResponse({
    status: 409,
    description: 'State, policy, capacity or immutable identity conflict',
  })
  @ApiParam({ name: 'uploadId', format: 'uuid' })
  @ApiCreatedResponse({ type: AnswerMediaUploadResponseDto })
  @RequiredPermissions('homework.submission_attachments.manage')
  complete(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ) {
    return this.media.upload({ homeworkId, questionId }, uploadId, 'complete');
  }
  @Post('answer-uploads/:uploadId/cancel')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Operate the exact immutable question upload' })
  @ApiResponse({
    status: 404,
    description: 'Resource unavailable or unauthorized',
  })
  @ApiResponse({
    status: 409,
    description: 'State, policy, capacity or immutable identity conflict',
  })
  @ApiParam({ name: 'uploadId', format: 'uuid' })
  @ApiCreatedResponse({ type: AnswerMediaUploadResponseDto })
  @RequiredPermissions('homework.submission_attachments.manage')
  cancel(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ) {
    return this.media.upload({ homeworkId, questionId }, uploadId, 'cancel');
  }
  @Post('answer-assets')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Bind a verified answer upload' })
  @ApiResponse({
    status: 404,
    description: 'Resource unavailable or unauthorized',
  })
  @ApiResponse({
    status: 409,
    description: 'State, policy, capacity or immutable identity conflict',
  })
  @ApiCreatedResponse({ type: AnswerMediaAssetResponseDto })
  @RequiredPermissions('homework.submission_attachments.manage')
  bind(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() dto: BindAnswerUploadDto,
  ) {
    return this.media.bind({ homeworkId, questionId }, dto);
  }
  @Delete('answer-assets/:assetId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete a draft answer asset' })
  @ApiResponse({
    status: 404,
    description: 'Resource unavailable or unauthorized',
  })
  @ApiResponse({
    status: 409,
    description: 'State, policy, capacity or immutable identity conflict',
  })
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiNoContentResponse()
  @RequiredPermissions('homework.submission_attachments.manage')
  remove(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
  ) {
    return this.media.remove({ ...{ homeworkId, questionId }, assetId });
  }
  @Get('answer-assets/:assetId/preview')
  @ApiOperation({ summary: 'Read authorized private answer bytes' })
  @ApiResponse({
    status: 404,
    description: 'Resource unavailable or unauthorized',
  })
  @ApiResponse({
    status: 409,
    description: 'State, policy, capacity or immutable identity conflict',
  })
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiHeader({ name: 'Range', required: false })
  @ApiHeader({ name: 'If-Range', required: false })
  @ApiOkResponse({ description: 'Private no-store bytes; HEAD has no body' })
  @ApiResponse({ status: 206, description: 'Single byte range' })
  @ApiResponse({ status: 416, description: 'Unsatisfiable byte range' })
  @RequiredPermissions('homework.submissions.view')
  async getpreview(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.media.open(
      undefined,
      { ...{ homeworkId, questionId }, assetId },
      privateMediaContentRequest(req, res, 'inline'),
    );
    await streamPrivateMediaContent(result, res, 'inline');
  }
  @Head('answer-assets/:assetId/preview')
  @ApiOperation({ summary: 'Read authorized private answer bytes' })
  @ApiResponse({
    status: 404,
    description: 'Resource unavailable or unauthorized',
  })
  @ApiResponse({
    status: 409,
    description: 'State, policy, capacity or immutable identity conflict',
  })
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiHeader({ name: 'Range', required: false })
  @ApiHeader({ name: 'If-Range', required: false })
  @ApiOkResponse({ description: 'Private no-store bytes; HEAD has no body' })
  @ApiResponse({ status: 206, description: 'Single byte range' })
  @ApiResponse({ status: 416, description: 'Unsatisfiable byte range' })
  @RequiredPermissions('homework.submissions.view')
  async headpreview(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.media.open(
      undefined,
      { ...{ homeworkId, questionId }, assetId },
      privateMediaContentRequest(req, res, 'inline'),
    );
    await streamPrivateMediaContent(result, res, 'inline');
  }
  @Get('answer-assets/:assetId/download')
  @ApiOperation({ summary: 'Read authorized private answer bytes' })
  @ApiResponse({
    status: 404,
    description: 'Resource unavailable or unauthorized',
  })
  @ApiResponse({
    status: 409,
    description: 'State, policy, capacity or immutable identity conflict',
  })
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiHeader({ name: 'Range', required: false })
  @ApiHeader({ name: 'If-Range', required: false })
  @ApiOkResponse({ description: 'Private no-store bytes; HEAD has no body' })
  @ApiResponse({ status: 206, description: 'Single byte range' })
  @ApiResponse({ status: 416, description: 'Unsatisfiable byte range' })
  @RequiredPermissions('homework.submissions.view')
  async getdownload(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.media.open(
      undefined,
      { ...{ homeworkId, questionId }, assetId },
      privateMediaContentRequest(req, res, 'attachment'),
    );
    await streamPrivateMediaContent(result, res, 'attachment');
  }
  @Head('answer-assets/:assetId/download')
  @ApiOperation({ summary: 'Read authorized private answer bytes' })
  @ApiResponse({
    status: 404,
    description: 'Resource unavailable or unauthorized',
  })
  @ApiResponse({
    status: 409,
    description: 'State, policy, capacity or immutable identity conflict',
  })
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiHeader({ name: 'Range', required: false })
  @ApiHeader({ name: 'If-Range', required: false })
  @ApiOkResponse({ description: 'Private no-store bytes; HEAD has no body' })
  @ApiResponse({ status: 206, description: 'Single byte range' })
  @ApiResponse({ status: 416, description: 'Unsatisfiable byte range' })
  @RequiredPermissions('homework.submissions.view')
  async headdownload(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.media.open(
      undefined,
      { ...{ homeworkId, questionId }, assetId },
      privateMediaContentRequest(req, res, 'attachment'),
    );
    await streamPrivateMediaContent(result, res, 'attachment');
  }
}
