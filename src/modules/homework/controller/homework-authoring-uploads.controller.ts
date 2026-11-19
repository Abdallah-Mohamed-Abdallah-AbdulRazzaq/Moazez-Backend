import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { RequiredPermissions } from '../../../common/decorators/required-permissions.decorator';
import { AssessmentMediaService } from '../../files/assessment-media/application/assessment-media.service';
import {
  AnswerMediaUploadResponseDto,
  CreateAnswerUploadDto,
} from '../../files/assessment-media/dto/answer-media.dto';
import { HomeworkCoreAccessGuard } from '../guards/homework-core-access.guard';

@ApiTags('core-homework-authoring-uploads')
@ApiBearerAuth()
@UseGuards(HomeworkCoreAccessGuard)
@RequiredPermissions('homework.attachments.manage')
@Controller('homework/assignments/:homeworkId/authoring/uploads')
export class HomeworkAuthoringUploadsController {
  constructor(private readonly uploads: AssessmentMediaService) {}

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @ApiCreatedResponse({ type: AnswerMediaUploadResponseDto })
  create(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Body() command: CreateAnswerUploadDto,
    @Req() request: Request,
  ) {
    return this.uploads.createHomeworkAssignmentUpload(homeworkId, {
      ...command,
      trustedOrigin: request.get('origin'),
    });
  }

  @Get(':uploadId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: AnswerMediaUploadResponseDto })
  status(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ) {
    return this.uploads.status(
      'HOMEWORK_ASSIGNMENT_MEDIA',
      homeworkId,
      uploadId,
    );
  }

  @Post(':uploadId/complete')
  @Header('Cache-Control', 'private, no-store')
  @ApiCreatedResponse({ type: AnswerMediaUploadResponseDto })
  complete(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ) {
    return this.uploads.complete(
      'HOMEWORK_ASSIGNMENT_MEDIA',
      homeworkId,
      uploadId,
    );
  }

  @Post(':uploadId/cancel')
  @Header('Cache-Control', 'private, no-store')
  @ApiCreatedResponse({ type: AnswerMediaUploadResponseDto })
  cancel(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ) {
    return this.uploads.cancel(
      'HOMEWORK_ASSIGNMENT_MEDIA',
      homeworkId,
      uploadId,
    );
  }
}
