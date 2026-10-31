import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Head,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Body,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiHeader,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import {
  CreateQuestionGroupDto,
  UpdateQuestionGroupDto,
  ChangeQuestionGroupLayoutDto,
  UpdateQuestionGroupAssetDto,
  QuestionGroupResponseDto,
  QuestionGroupAssetResponseDto,
} from '../../../../common/question-groups/question-group.dto';
import { CreateQuestionGroupAssetDto } from '../../../../modules/files/assessment-media/dto/question-group-asset.dto';
import { answerMediaSurfaceGuard } from '../../../../modules/files/assessment-media/application/answer-media-surface.guard';
import {
  privateMediaContentRequest,
  streamPrivateMediaContent,
} from '../../../../infrastructure/storage/private-media-content.response';
import { GradeQuestionGroupsService } from '../application/grade-question-groups.service';
@ApiTags('core-grade-question-groups')
@ApiBearerAuth()
@UseGuards(answerMediaSurfaceGuard('SCHOOL_USER', 'ORGANIZATION_USER'))
@ApiParam({ name: 'assessmentId', format: 'uuid' })
@ApiResponse({
  status: 404,
  description: 'Resource unavailable or unauthorized',
})
@ApiResponse({
  status: 409,
  description:
    'Stale membership, published/locked/attempted structure or immutable identity',
})
@Controller('grades/assessments/:assessmentId')
export class CoreGradeQuestionGroupsController {
  constructor(private readonly groups: GradeQuestionGroupsService) {}
  @Get('groups')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Read group display, derived points and stable mixed layout',
  })
  @ApiOkResponse({ type: QuestionGroupResponseDto })
  @RequiredPermissions('grades.assessments.view')
  list(@Param('assessmentId', new ParseUUIDPipe()) assessmentId: string) {
    return this.groups.list({ surface: 'core' as const }, { assessmentId });
  }

  @Post('groups')
  @ApiOperation({
    summary: 'Create a non-answerable group in editable structure',
  })
  @ApiCreatedResponse({ type: QuestionGroupResponseDto })
  @RequiredPermissions('grades.questions.manage')
  create(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Body() command: CreateQuestionGroupDto,
  ) {
    return this.groups.create(
      { surface: 'core' as const },
      { assessmentId },
      command,
    );
  }
  @Put('groups/layout')
  @ApiOperation({
    summary:
      'Atomically move/reorder child questions and mixed blocks using expected current membership',
  })
  @ApiOkResponse({ type: QuestionGroupResponseDto })
  @RequiredPermissions('grades.questions.manage')
  layout(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Body() command: ChangeQuestionGroupLayoutDto,
  ) {
    return this.groups.layout(
      { surface: 'core' as const },
      { assessmentId },
      command,
    );
  }
  @Patch('groups/:groupId')
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiOperation({
    summary: 'Update bounded group display or validated shared Rich AST',
  })
  @ApiOkResponse({ type: QuestionGroupResponseDto })
  @RequiredPermissions('grades.questions.manage')
  update(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Body() command: UpdateQuestionGroupDto,
  ) {
    return this.groups.update(
      { surface: 'core' as const },
      { assessmentId, groupId },
      command,
    );
  }
  @Delete('groups/:groupId')
  @HttpCode(204)
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiOperation({
    summary:
      'Detach active children and soft-delete group/references; retain Files',
  })
  @RequiredPermissions('grades.questions.manage')
  remove(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
  ) {
    return this.groups.remove(
      { surface: 'core' as const },
      { assessmentId, groupId },
    );
  }
  @Post('groups/:groupId/assets')
  @ApiCreatedResponse({ type: QuestionGroupAssetResponseDto })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiOperation({
    summary:
      'Bind an exact verified authoring upload or approved external HTTPS to this group',
  })
  @RequiredPermissions('grades.questions.manage')
  createAsset(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Body() command: CreateQuestionGroupAssetDto,
  ) {
    return this.groups.createAsset(
      { surface: 'core' as const },
      { assessmentId, groupId },
      command,
    );
  }
  @Patch('groups/:groupId/assets/:assetId')
  @ApiOkResponse({ type: QuestionGroupAssetResponseDto })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({
    summary:
      'Update group asset display/order; source identity stays immutable',
  })
  @RequiredPermissions('grades.questions.manage')
  updateAsset(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Body() command: UpdateQuestionGroupAssetDto,
  ) {
    return this.groups.updateAsset(
      { surface: 'core' as const },
      { assessmentId, groupId, assetId },
      command,
    );
  }
  @Delete('groups/:groupId/assets/:assetId')
  @HttpCode(204)
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({ summary: 'Soft-delete a detached group asset reference' })
  @RequiredPermissions('grades.questions.manage')
  removeAsset(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
  ) {
    return this.groups.removeAsset(
      { surface: 'core' as const },
      { assessmentId, groupId, assetId },
    );
  }

  @Get('groups/:groupId/assets/:assetId/preview')
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({ summary: 'Read authorized private group stimulus bytes' })
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 206, description: 'Partial content' })
  @ApiResponse({ status: 416, description: 'Range not satisfiable' })
  @RequiredPermissions('grades.assessments.view')
  async getpreview(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.groups.open(
      { surface: 'core' as const },
      { assessmentId, groupId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }

  @Get('groups/:groupId/assets/:assetId/download')
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({ summary: 'Read authorized private group stimulus bytes' })
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 206, description: 'Partial content' })
  @ApiResponse({ status: 416, description: 'Range not satisfiable' })
  @RequiredPermissions('grades.assessments.view')
  async getdownload(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.groups.open(
      { surface: 'core' as const },
      { assessmentId, groupId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }

  @Head('groups/:groupId/assets/:assetId/preview')
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({ summary: 'Read authorized private group stimulus bytes' })
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 206, description: 'Partial content' })
  @ApiResponse({ status: 416, description: 'Range not satisfiable' })
  @RequiredPermissions('grades.assessments.view')
  async headpreview(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.groups.open(
      { surface: 'core' as const },
      { assessmentId, groupId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }

  @Head('groups/:groupId/assets/:assetId/download')
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({ summary: 'Read authorized private group stimulus bytes' })
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 206, description: 'Partial content' })
  @ApiResponse({ status: 416, description: 'Range not satisfiable' })
  @RequiredPermissions('grades.assessments.view')
  async headdownload(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.groups.open(
      { surface: 'core' as const },
      { assessmentId, groupId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
}
