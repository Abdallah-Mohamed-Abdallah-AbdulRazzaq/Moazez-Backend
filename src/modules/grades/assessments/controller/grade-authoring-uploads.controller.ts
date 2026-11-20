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
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { AssessmentMediaService } from '../../../files/assessment-media/application/assessment-media.service';
import {
  AnswerMediaUploadResponseDto,
  CreateAnswerUploadDto,
} from '../../../files/assessment-media/dto/answer-media.dto';
import { answerMediaSurfaceGuard } from '../../../files/assessment-media/application/answer-media-surface.guard';

@ApiTags('core-grade-authoring-uploads')
@ApiBearerAuth()
@UseGuards(answerMediaSurfaceGuard('SCHOOL_USER', 'ORGANIZATION_USER'))
@RequiredPermissions('grades.questions.manage')
@Controller('grades/assessments/:assessmentId/authoring/uploads')
export class GradeAuthoringUploadsController {
  constructor(private readonly uploads: AssessmentMediaService) {}

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @ApiCreatedResponse({ type: AnswerMediaUploadResponseDto })
  create(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Body() command: CreateAnswerUploadDto,
    @Req() request: Request,
  ) {
    return this.uploads.createGradeAssessmentUpload(assessmentId, {
      ...command,
      trustedOrigin: request.get('origin'),
    });
  }

  @Get(':uploadId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: AnswerMediaUploadResponseDto })
  status(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ) {
    return this.uploads.status(
      'GRADE_ASSESSMENT_MEDIA',
      assessmentId,
      uploadId,
    );
  }

  @Post(':uploadId/complete')
  @Header('Cache-Control', 'private, no-store')
  @ApiCreatedResponse({ type: AnswerMediaUploadResponseDto })
  complete(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ) {
    return this.uploads.complete(
      'GRADE_ASSESSMENT_MEDIA',
      assessmentId,
      uploadId,
    );
  }

  @Post(':uploadId/cancel')
  @Header('Cache-Control', 'private, no-store')
  @ApiCreatedResponse({ type: AnswerMediaUploadResponseDto })
  cancel(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ) {
    return this.uploads.cancel(
      'GRADE_ASSESSMENT_MEDIA',
      assessmentId,
      uploadId,
    );
  }
}
