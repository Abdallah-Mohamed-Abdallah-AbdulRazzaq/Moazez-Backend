import { UseGuards } from '@nestjs/common';
import { answerMediaSurfaceGuard } from '../../../../files/assessment-media/application/answer-media-surface.guard';
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
import { GradeAssetsService } from '../../../../grades/assessments/application/grade-assets.service';
import {
  CreateGradeAssetDto,
  UpdateGradeAssetDto,
  ReorderGradeAssetDto,
  GradeAssetResponseDto,
  GradeAssetsResponseDto,
} from '../../../../grades/assessments/dto/grade-asset.dto';

@ApiTags('teacher-grade-authoring-question-assets')
@ApiBearerAuth()
@ApiParam({ name: 'classId', format: 'uuid' })
@UseGuards(answerMediaSurfaceGuard('TEACHER'))
@ApiParam({ name: 'assessmentId', format: 'uuid' })
@ApiParam({ name: 'questionId', format: 'uuid' })
@Controller(
  'teacher/classroom/:classId/grades/assessments/:assessmentId/authoring/questions/:questionId/assets',
)
export class TeacherGradeAuthoringQuestionAssetsController {
  constructor(private readonly assets: GradeAssetsService) {}

  @Get()
  @RequiredPermissions('grades.teacher_authoring.manage')
  @ApiOperation({ summary: 'List assets of the exact owned Grades question' })
  @ApiOkResponse({ type: GradeAssetsResponseDto })
  list(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ) {
    return this.assets.list(
      { surface: 'teacher' as const, classId, authoring: true as const },
      { assessmentId, questionId },
    );
  }

  @Get(':assetId')
  @RequiredPermissions('grades.teacher_authoring.manage')
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({ summary: 'Get one exact Grades question asset' })
  @ApiOkResponse({ type: GradeAssetResponseDto })
  get(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
  ) {
    return this.assets.get(
      { surface: 'teacher' as const, classId, authoring: true as const },
      { assessmentId, questionId, assetId },
    );
  }

  @Post()
  @RequiredPermissions('grades.teacher_authoring.manage')
  @ApiOperation({
    summary:
      'Bind a verified managed File or safe HTTPS reference in DRAFT Grades',
  })
  @ApiBody({ type: CreateGradeAssetDto })
  @ApiCreatedResponse({ type: GradeAssetResponseDto })
  create(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() dto: CreateGradeAssetDto,
  ) {
    return this.assets.create(
      { surface: 'teacher' as const, classId, authoring: true as const },
      { assessmentId, questionId },
      dto,
    );
  }

  @Patch(':assetId')
  @RequiredPermissions('grades.teacher_authoring.manage')
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
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Body() dto: UpdateGradeAssetDto,
  ) {
    return this.assets.update(
      { surface: 'teacher' as const, classId, authoring: true as const },
      { assessmentId, questionId, assetId },
      dto,
    );
  }

  @Patch(':assetId/reorder')
  @RequiredPermissions('grades.teacher_authoring.manage')
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
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Body() dto: ReorderGradeAssetDto,
  ) {
    return this.assets.reorder(
      { surface: 'teacher' as const, classId, authoring: true as const },
      { assessmentId, questionId, assetId },
      dto,
    );
  }

  @Delete(':assetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiredPermissions('grades.teacher_authoring.manage')
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({
    summary: 'Soft-delete a DRAFT asset while preserving File retention',
  })
  @ApiNoContentResponse()
  remove(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
  ) {
    return this.assets.remove(
      { surface: 'teacher' as const, classId, authoring: true as const },
      { assessmentId, questionId, assetId },
    );
  }

  @Get(':assetId/preview')
  @RequiredPermissions('grades.teacher_authoring.manage')
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
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      { surface: 'teacher' as const, classId, authoring: true as const },
      { assessmentId, questionId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }

  @Head(':assetId/preview')
  @RequiredPermissions('grades.teacher_authoring.manage')
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
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      { surface: 'teacher' as const, classId, authoring: true as const },
      { assessmentId, questionId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }

  @Get(':assetId/download')
  @RequiredPermissions('grades.teacher_authoring.manage')
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
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      { surface: 'teacher' as const, classId, authoring: true as const },
      { assessmentId, questionId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }

  @Head(':assetId/download')
  @RequiredPermissions('grades.teacher_authoring.manage')
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
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      { surface: 'teacher' as const, classId, authoring: true as const },
      { assessmentId, questionId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
}
