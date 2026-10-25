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
import { GradeAssetsService } from '../application/grade-assets.service';
import {
  CreateGradeAssetDto,
  UpdateGradeAssetDto,
  ReorderGradeAssetDto,
  GradeAssetResponseDto,
  GradeAssetsResponseDto,
} from '../dto/grade-asset.dto';

@ApiTags('core-grade-assets')
@ApiBearerAuth()
@ApiParam({ name: 'assessmentId', format: 'uuid' })
@ApiParam({ name: 'questionId', format: 'uuid' })
@Controller('grades/assessments/:assessmentId/questions/:questionId/assets')
export class GradeQuestionAssetsController {
  constructor(private readonly assets: GradeAssetsService) {}

  @Get()
  @RequiredPermissions('grades.questions.view')
  @ApiOperation({ summary: 'List assets of the exact owned Grades question' })
  @ApiOkResponse({ type: GradeAssetsResponseDto })
  list(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ) {
    return this.assets.list({ surface: 'core' }, { assessmentId, questionId });
  }

  @Get(':assetId')
  @RequiredPermissions('grades.questions.view')
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({ summary: 'Get one exact Grades question asset' })
  @ApiOkResponse({ type: GradeAssetResponseDto })
  get(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
  ) {
    return this.assets.get(
      { surface: 'core' },
      { assessmentId, questionId, assetId },
    );
  }

  @Post()
  @RequiredPermissions('grades.questions.manage')
  @ApiOperation({
    summary:
      'Bind a verified managed File or safe HTTPS reference in DRAFT Grades',
  })
  @ApiBody({ type: CreateGradeAssetDto })
  @ApiCreatedResponse({ type: GradeAssetResponseDto })
  create(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() dto: CreateGradeAssetDto,
  ) {
    return this.assets.create(
      { surface: 'core' },
      { assessmentId, questionId },
      dto,
    );
  }

  @Patch(':assetId')
  @RequiredPermissions('grades.questions.manage')
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({
    summary:
      'Update DRAFT asset display metadata; source identity is immutable',
  })
  @ApiBody({ type: UpdateGradeAssetDto })
  @ApiOkResponse({ type: GradeAssetResponseDto })
  update(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Body() dto: UpdateGradeAssetDto,
  ) {
    return this.assets.update(
      { surface: 'core' },
      { assessmentId, questionId, assetId },
      dto,
    );
  }

  @Patch(':assetId/reorder')
  @RequiredPermissions('grades.questions.manage')
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({
    summary:
      'Set a nonnegative DRAFT asset sort order; stable ties are allowed',
  })
  @ApiBody({ type: ReorderGradeAssetDto })
  @ApiOkResponse({ type: GradeAssetResponseDto })
  reorder(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Body() dto: ReorderGradeAssetDto,
  ) {
    return this.assets.reorder(
      { surface: 'core' },
      { assessmentId, questionId, assetId },
      dto,
    );
  }

  @Delete(':assetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiredPermissions('grades.questions.manage')
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({
    summary: 'Soft-delete a DRAFT asset while preserving File retention',
  })
  @ApiNoContentResponse()
  remove(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
  ) {
    return this.assets.remove(
      { surface: 'core' },
      { assessmentId, questionId, assetId },
    );
  }

  @Get(':assetId/preview')
  @RequiredPermissions('grades.questions.view')
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
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      { surface: 'core' },
      { assessmentId, questionId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }

  @Head(':assetId/preview')
  @RequiredPermissions('grades.questions.view')
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
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      { surface: 'core' },
      { assessmentId, questionId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }

  @Get(':assetId/download')
  @RequiredPermissions('grades.questions.view')
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
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      { surface: 'core' },
      { assessmentId, questionId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }

  @Head(':assetId/download')
  @RequiredPermissions('grades.questions.view')
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
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const content = await this.assets.openContent(
      { surface: 'core' },
      { assessmentId, questionId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
}
