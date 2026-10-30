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
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { QuestionGroupResponseDto } from '../../../../common/question-groups/question-group.dto';
import { answerMediaSurfaceGuard } from '../../../../modules/files/assessment-media/application/answer-media-surface.guard';
import {
  privateMediaContentRequest,
  streamPrivateMediaContent,
} from '../../../../infrastructure/storage/private-media-content.response';
import { StudentHomeworkQuestionAssetsService } from '../application/student-homework-question-assets.service';
@ApiTags('student-homework-question-groups')
@ApiBearerAuth()
@UseGuards(answerMediaSurfaceGuard('STUDENT'))
@ApiParam({ name: 'homeworkId', format: 'uuid' })
@ApiResponse({
  status: 404,
  description: 'Resource unavailable or unauthorized',
})
@Controller('student/homeworks/:homeworkId')
export class StudentHomeworkQuestionGroupsController {
  constructor(private readonly groups: StudentHomeworkQuestionAssetsService) {}
  @Get('groups')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Read authorized group context without private answer keys',
  })
  @ApiOkResponse({ type: QuestionGroupResponseDto })
  @RequiredPermissions('homework.assignments.view')
  list(@Param('homeworkId', new ParseUUIDPipe()) homeworkId: string) {
    return this.groups.groupMetadata(homeworkId);
  }

  @Get('groups/:groupId/assets/:assetId/preview')
  @ApiOperation({ summary: 'Read own authorized private group stimulus bytes' })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiParam({ name: 'assetId', format: 'uuid' })
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 206, description: 'Partial content' })
  @ApiResponse({ status: 416, description: 'Range not satisfiable' })
  @RequiredPermissions('homework.assignments.view')
  async getpreview(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.groups.groupContent(
      { homeworkId, groupId, assetId },
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
  @RequiredPermissions('homework.assignments.view')
  async getdownload(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.groups.groupContent(
      { homeworkId, groupId, assetId },
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
  @RequiredPermissions('homework.assignments.view')
  async headpreview(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.groups.groupContent(
      { homeworkId, groupId, assetId },
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
  @RequiredPermissions('homework.assignments.view')
  async headdownload(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.groups.groupContent(
      { homeworkId, groupId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
}
