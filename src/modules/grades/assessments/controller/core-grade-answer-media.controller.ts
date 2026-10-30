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
import { CoreGradeAnswerMediaService } from '../application/core-grade-answer-media.service';

@ApiTags('core-grade-answer-media')
@ApiBearerAuth()
@UseGuards(
  answerMediaSurfaceGuard('STUDENT', 'SCHOOL_USER', 'ORGANIZATION_USER'),
)
@ApiParam({ name: 'submissionId', format: 'uuid' })
@ApiParam({ name: 'questionId', format: 'uuid' })
@Controller('grades/submissions/:submissionId/questions/:questionId')
export class CoreGradeAnswerMediaController {
  constructor(private readonly media: CoreGradeAnswerMediaService) {}
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
  @RequiredPermissions('grades.submissions.view')
  list(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ) {
    return this.media.list({ submissionId, questionId });
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
  @RequiredPermissions('grades.submissions.submit')
  create(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() dto: CreateAnswerUploadDto,
    @Req() req: Request,
  ) {
    return this.media.create(
      { submissionId, questionId },
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
  @RequiredPermissions('grades.submissions.submit')
  status(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ) {
    return this.media.upload({ submissionId, questionId }, uploadId, 'status');
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
  @RequiredPermissions('grades.submissions.submit')
  complete(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ) {
    return this.media.upload(
      { submissionId, questionId },
      uploadId,
      'complete',
    );
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
  @RequiredPermissions('grades.submissions.submit')
  cancel(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ) {
    return this.media.upload({ submissionId, questionId }, uploadId, 'cancel');
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
  @RequiredPermissions('grades.submissions.submit')
  bind(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() dto: BindAnswerUploadDto,
  ) {
    return this.media.bind({ submissionId, questionId }, dto);
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
  @RequiredPermissions('grades.submissions.submit')
  remove(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
  ) {
    return this.media.remove({
      ...{ submissionId, questionId },
      assetId,
    });
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
  @RequiredPermissions('grades.submissions.view')
  async getpreview(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.media.open(
      { ...{ submissionId, questionId }, assetId },
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
  @RequiredPermissions('grades.submissions.view')
  async headpreview(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.media.open(
      { ...{ submissionId, questionId }, assetId },
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
  @RequiredPermissions('grades.submissions.view')
  async getdownload(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.media.open(
      { ...{ submissionId, questionId }, assetId },
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
  @RequiredPermissions('grades.submissions.view')
  async headdownload(
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.media.open(
      { ...{ submissionId, questionId }, assetId },
      privateMediaContentRequest(req, res, 'attachment'),
    );
    await streamPrivateMediaContent(result, res, 'attachment');
  }
}
