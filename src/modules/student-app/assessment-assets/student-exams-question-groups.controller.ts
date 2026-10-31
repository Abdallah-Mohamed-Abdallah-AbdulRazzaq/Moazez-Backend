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
  ApiOkResponse,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import { QuestionGroupResponseDto } from '../../../common/question-groups/question-group.dto';
import { answerMediaSurfaceGuard } from '../../../modules/files/assessment-media/application/answer-media-surface.guard';
import {
  privateMediaContentRequest,
  streamPrivateMediaContent,
} from '../../../infrastructure/storage/private-media-content.response';
import { StudentGradeAssetsService } from './student-grade-assets.service';
@ApiTags('student-exams-question-groups')
@ApiBearerAuth()
@UseGuards(answerMediaSurfaceGuard('STUDENT'))
@ApiParam({ name: 'assessmentId', format: 'uuid' })
@ApiResponse({
  status: 404,
  description: 'Resource unavailable or unauthorized',
})
@Controller('student/exams/:assessmentId')
export class StudentExamsQuestionGroupsController {
  constructor(private readonly groups: StudentGradeAssetsService) {}
  @Get('groups')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Read authorized group context without private answer keys',
  })
  @ApiOkResponse({ type: QuestionGroupResponseDto })
  @RequiredPermissions('grades.assessments.view')
  list(@Param('assessmentId', new ParseUUIDPipe()) assessmentId: string) {
    return this.groups.groupMetadata('student-exams', assessmentId);
  }

  @Get('groups/:groupId/assets/:assetId/preview')
  @ApiOperation({ summary: 'Read own authorized private group stimulus bytes' })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiParam({ name: 'assetId', format: 'uuid' })
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
    const content = await this.groups.groupContent(
      'student-exams',
      { assessmentId, groupId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }

  @Get('groups/:groupId/assets/:assetId/download')
  @ApiOperation({ summary: 'Read own authorized private group stimulus bytes' })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiParam({ name: 'assetId', format: 'uuid' })
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
    const content = await this.groups.groupContent(
      'student-exams',
      { assessmentId, groupId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }

  @Head('groups/:groupId/assets/:assetId/preview')
  @ApiOperation({ summary: 'Read own authorized private group stimulus bytes' })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiParam({ name: 'assetId', format: 'uuid' })
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
    const content = await this.groups.groupContent(
      'student-exams',
      { assessmentId, groupId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }

  @Head('groups/:groupId/assets/:assetId/download')
  @ApiOperation({ summary: 'Read own authorized private group stimulus bytes' })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiParam({ name: 'assetId', format: 'uuid' })
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
    const content = await this.groups.groupContent(
      'student-exams',
      { assessmentId, groupId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
}
