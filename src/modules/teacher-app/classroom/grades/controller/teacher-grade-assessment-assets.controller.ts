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
import { RequiredPermissions } from '../../../../../common/decorators/required-permissions.decorator';
import {
  privateMediaContentRequest,
  streamPrivateMediaContent,
} from '../../../../../infrastructure/storage/private-media-content.response';
import { TeacherGradeAssetsService } from '../application/teacher-grade-assets.service';
import {
  CreateGradeAssetDto,
  UpdateGradeAssetDto,
  ReorderGradeAssetDto,
  GradeAssetResponseDto,
  GradeAssetsResponseDto,
} from '../../../../grades/assessments/dto/grade-asset.dto';

@ApiTags('teacher-grade-assets')
@ApiBearerAuth()
@ApiParam({ name: 'classId', format: 'uuid' })
@ApiParam({ name: 'assessmentId', format: 'uuid' })
@Controller(
  'teacher/classroom/:classId/grades/assessments/:assessmentId/assets',
)
export class TeacherGradeAssessmentAssetsController {
  constructor(private readonly assets: TeacherGradeAssetsService) {}

  @Get()
  @RequiredPermissions('grades.assessments.view')
  @ApiOperation({ summary: 'List assets of the exact owned Grades question' })
  @ApiOkResponse({ type: GradeAssetsResponseDto })
  list(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
  ) {
    return this.assets.list({ classId, assessmentId });
  }

  @Get(':assetId')
  @RequiredPermissions('grades.assessments.view')
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({ summary: 'Get one exact Grades question asset' })
  @ApiOkResponse({ type: GradeAssetResponseDto })
  get(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
  ) {
    return this.assets.get({ classId, assessmentId, assetId });
  }

  @Post()
  @RequiredPermissions('grades.assessments.manage')
  @ApiOperation({
    summary:
      'Bind a verified managed File or safe HTTPS reference in DRAFT Grades',
  })
  @ApiBody({ type: CreateGradeAssetDto })
  @ApiCreatedResponse({ type: GradeAssetResponseDto })
  create(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Body() dto: CreateGradeAssetDto,
  ) {
    return this.assets.create({ classId, assessmentId }, dto);
  }

  @Patch(':assetId')
  @RequiredPermissions('grades.assessments.manage')
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({
    summary:
      'Update DRAFT asset display metadata; source identity is immutable',
  })
  @ApiBody({ type: UpdateGradeAssetDto })
  @ApiOkResponse({ type: GradeAssetResponseDto })
  update(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Body() dto: UpdateGradeAssetDto,
  ) {
    return this.assets.update({ classId, assessmentId, assetId }, dto);
  }

  @Patch(':assetId/reorder')
  @RequiredPermissions('grades.assessments.manage')
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({
    summary:
      'Set a nonnegative DRAFT asset sort order; stable ties are allowed',
  })
  @ApiBody({ type: ReorderGradeAssetDto })
  @ApiOkResponse({ type: GradeAssetResponseDto })
  reorder(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Body() dto: ReorderGradeAssetDto,
  ) {
    return this.assets.reorder({ classId, assessmentId, assetId }, dto);
  }

  @Delete(':assetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiredPermissions('grades.assessments.manage')
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({
    summary: 'Soft-delete a DRAFT asset while preserving File retention',
  })
  @ApiNoContentResponse()
  remove(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
  ) {
    return this.assets.remove({ classId, assessmentId, assetId });
  }

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
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      { classId, assessmentId, assetId },
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
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      { classId, assessmentId, assetId },
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
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      { classId, assessmentId, assetId },
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
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      { classId, assessmentId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
}
