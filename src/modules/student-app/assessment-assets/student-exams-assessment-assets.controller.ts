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
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import {
  privateMediaContentRequest,
  streamPrivateMediaContent,
} from '../../../infrastructure/storage/private-media-content.response';
import { StudentGradeAssetsService } from './student-grade-assets.service';

@ApiTags('student-grade-assets')
@ApiBearerAuth()
@ApiParam({ name: 'assessmentId', format: 'uuid' })
@Controller('student/exams/:assessmentId/assets')
export class StudentExamsAssessmentAssetsController {
  constructor(private readonly assets: StudentGradeAssetsService) {}

  @Get(':assetId/preview')
  @RequiredPermissions('grades.assessments.view')
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
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      'student-exams',
      { assessmentId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }

  @Head(':assetId/preview')
  @RequiredPermissions('grades.assessments.view')
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
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      'student-exams',
      { assessmentId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }

  @Get(':assetId/download')
  @RequiredPermissions('grades.assessments.view')
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
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      'student-exams',
      { assessmentId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }

  @Head(':assetId/download')
  @RequiredPermissions('grades.assessments.view')
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
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      'student-exams',
      { assessmentId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
}
