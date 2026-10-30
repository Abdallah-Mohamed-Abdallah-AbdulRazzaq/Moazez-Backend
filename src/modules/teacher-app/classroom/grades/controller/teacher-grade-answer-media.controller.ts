import {
  Controller,
  Get,
  Head,
  Header,
  Param,
  ParseUUIDPipe,
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
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { RequiredPermissions } from '../../../../../common/decorators/required-permissions.decorator';
import {
  privateMediaContentRequest,
  streamPrivateMediaContent,
} from '../../../../../infrastructure/storage/private-media-content.response';
import { answerMediaSurfaceGuard } from '../../../../files/assessment-media/application/answer-media-surface.guard';
import { AnswerMediaAssetsResponseDto } from '../../../../files/assessment-media/dto/answer-media.dto';
import { GradeAnswerMediaService } from '../../../../grades/assessments/application/grade-answer-media.service';

@ApiTags('teacher-grade-answer-media')
@ApiBearerAuth()
@UseGuards(answerMediaSurfaceGuard('TEACHER'))
@ApiParam({ name: 'classId', format: 'uuid' })
@ApiParam({ name: 'assessmentId', format: 'uuid' })
@ApiParam({ name: 'submissionId', format: 'uuid' })
@ApiParam({ name: 'questionId', format: 'uuid' })
@Controller(
  'teacher/classroom/:classId/grades/assessments/:assessmentId/submissions/:submissionId/questions/:questionId',
)
export class TeacherGradeAnswerMediaController {
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
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ) {
    return this.media.list({ classId, assessmentId, submissionId, questionId });
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
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.media.open(
      { ...{ classId, assessmentId, submissionId, questionId }, assetId },
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
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.media.open(
      { ...{ classId, assessmentId, submissionId, questionId }, assetId },
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
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.media.open(
      { ...{ classId, assessmentId, submissionId, questionId }, assetId },
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
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.media.open(
      { ...{ classId, assessmentId, submissionId, questionId }, assetId },
      privateMediaContentRequest(req, res, 'attachment'),
    );
    await streamPrivateMediaContent(result, res, 'attachment');
  }
}
