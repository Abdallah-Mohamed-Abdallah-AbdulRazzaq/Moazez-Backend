import {
  Controller,
  Get,
  Head,
  Param,
  ParseUUIDPipe,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
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
import { StudentHomeworkQuestionAssetsService } from '../application/student-homework-question-assets.service';

@ApiTags('student-homework-question-assets')
@ApiBearerAuth()
@ApiParam({ name: 'homeworkId', format: 'uuid' })
@ApiParam({ name: 'questionId', format: 'uuid' })
@Controller('student/homeworks/:homeworkId/questions/:questionId/assets')
export class StudentHomeworkQuestionAssetsController {
  constructor(private readonly assets: StudentHomeworkQuestionAssetsService) {}

  @Get(':assetId/preview')
  @RequiredPermissions('homework.assignments.view')
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
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      { homeworkId, questionId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }

  @Head(':assetId/preview')
  @RequiredPermissions('homework.assignments.view')
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
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      { homeworkId, questionId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }

  @Get(':assetId/download')
  @RequiredPermissions('homework.assignments.view')
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
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      { homeworkId, questionId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }

  @Head(':assetId/download')
  @RequiredPermissions('homework.assignments.view')
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
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      { homeworkId, questionId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
}
