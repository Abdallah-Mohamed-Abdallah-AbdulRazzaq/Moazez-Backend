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
  ApiResponse,
  ApiOkResponse,
  ApiHeader,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { RequiredPermissions } from '../../../../../common/decorators/required-permissions.decorator';
import { QuestionGroupResponseDto } from '../../../../../common/question-groups/question-group.dto';
import { answerMediaSurfaceGuard } from '../../../../../modules/files/assessment-media/application/answer-media-surface.guard';
import {
  privateMediaContentRequest,
  streamPrivateMediaContent,
} from '../../../../../infrastructure/storage/private-media-content.response';
import { GradeQuestionGroupsService } from '../../../../grades/assessments/application/grade-question-groups.service';
@ApiTags('teacher-grade-question-groups')
@ApiBearerAuth()
@UseGuards(answerMediaSurfaceGuard('TEACHER'))
@ApiParam({ name: 'assessmentId', format: 'uuid' })
@ApiParam({ name: 'classId', format: 'uuid' })
@ApiResponse({
  status: 404,
  description: 'Resource unavailable or unauthorized',
})
@ApiResponse({
  status: 409,
  description:
    'Stale membership, published/locked/attempted structure or immutable identity',
})
@Controller('teacher/classroom/:classId/grades/assessments/:assessmentId')
export class TeacherGradeQuestionGroupsController {
  constructor(private readonly groups: GradeQuestionGroupsService) {}
  @Get('groups')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Read group display, derived points and stable mixed layout',
  })
  @ApiOkResponse({ type: QuestionGroupResponseDto })
  @RequiredPermissions('grades.submissions.view')
  list(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('classId', new ParseUUIDPipe()) classId: string,
  ) {
    return this.groups.list(
      { surface: 'teacher' as const, classId },
      { assessmentId },
    );
  }

  @Get('groups/:groupId/assets/:assetId/preview')
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiOperation({ summary: 'Read authorized private group stimulus bytes' })
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 206, description: 'Partial content' })
  @ApiResponse({ status: 416, description: 'Range not satisfiable' })
  @RequiredPermissions('grades.submissions.view')
  async getpreview(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.groups.open(
      { surface: 'teacher' as const, classId },
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
  @RequiredPermissions('grades.submissions.view')
  async getdownload(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.groups.open(
      { surface: 'teacher' as const, classId },
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
  @RequiredPermissions('grades.submissions.view')
  async headpreview(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.groups.open(
      { surface: 'teacher' as const, classId },
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
  @RequiredPermissions('grades.submissions.view')
  async headdownload(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.groups.open(
      { surface: 'teacher' as const, classId },
      { assessmentId, groupId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
}
