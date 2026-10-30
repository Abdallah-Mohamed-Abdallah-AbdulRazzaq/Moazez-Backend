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
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import {
  privateMediaContentRequest,
  streamPrivateMediaContent,
} from '../../../infrastructure/storage/private-media-content.response';
import { answerMediaSurfaceGuard } from '../../files/assessment-media/application/answer-media-surface.guard';
import {
  BindAnswerUploadDto,
  CreateAnswerUploadDto,
  AnswerMediaUploadResponseDto,
  AnswerMediaAssetResponseDto,
  AnswerMediaAssetsResponseDto,
} from '../../files/assessment-media/dto/answer-media.dto';
import { GradeAnswerMediaService } from '../../grades/assessments/application/grade-answer-media.service';

@ApiTags('student-grade-answer-media')
@ApiBearerAuth()
@UseGuards(answerMediaSurfaceGuard('STUDENT'))
@ApiParam({ name: 'assessmentId', format: 'uuid' })
@ApiParam({ name: 'submissionId', format: 'uuid' })
@ApiParam({ name: 'questionId', format: 'uuid' })
@Controller(
  'student/exams/:assessmentId/submissions/:submissionId/questions/:questionId',
)
export class StudentGradeAnswerMediaController {
  constructor(private readonly media: GradeAnswerMediaService) {}
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
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ) {
    return this.media.list({ assessmentId, submissionId, questionId });
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
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() dto: CreateAnswerUploadDto,
    @Req() req: Request,
  ) {
    return this.media.create(
      { assessmentId, submissionId, questionId },
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
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ) {
    return this.media.upload(
      { assessmentId, submissionId, questionId },
      uploadId,
      'status',
    );
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
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ) {
    return this.media.upload(
      { assessmentId, submissionId, questionId },
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
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ) {
    return this.media.upload(
      { assessmentId, submissionId, questionId },
      uploadId,
      'cancel',
    );
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
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() dto: BindAnswerUploadDto,
  ) {
    return this.media.bind({ assessmentId, submissionId, questionId }, dto);
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
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
  ) {
    return this.media.remove({
      ...{ assessmentId, submissionId, questionId },
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
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.media.open(
      { ...{ assessmentId, submissionId, questionId }, assetId },
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
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.media.open(
      { ...{ assessmentId, submissionId, questionId }, assetId },
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
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.media.open(
      { ...{ assessmentId, submissionId, questionId }, assetId },
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
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.media.open(
      { ...{ assessmentId, submissionId, questionId }, assetId },
      privateMediaContentRequest(req, res, 'attachment'),
    );
    await streamPrivateMediaContent(result, res, 'attachment');
  }
}
