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
import { RequiredPermissions } from '../../../../../common/decorators/required-permissions.decorator';
import { answerMediaSurfaceGuard } from '../../../../files/assessment-media/application/answer-media-surface.guard';
import {
  AnswerMediaUploadResponseDto,
  CreateAnswerUploadDto,
} from '../../../../files/assessment-media/dto/answer-media.dto';
import { TeacherGradeAuthoringService } from '../application/teacher-grade-authoring.service';
import { TeacherClassroomAssessmentParamsDto } from '../dto/teacher-classroom-grades.dto';

@ApiTags('teacher-grade-authoring-uploads')
@ApiBearerAuth()
@UseGuards(answerMediaSurfaceGuard('TEACHER'))
@RequiredPermissions('grades.teacher_authoring.manage')
@Controller(
  'teacher/classroom/:classId/grades/assessments/:assessmentId/authoring/uploads',
)
export class TeacherGradeAuthoringUploadsController {
  constructor(private readonly authoring: TeacherGradeAuthoringService) {}
  @Post()
  @Header('Cache-Control', 'private, no-store')
  @ApiCreatedResponse({ type: AnswerMediaUploadResponseDto })
  create(
    @Param() p: TeacherClassroomAssessmentParamsDto,
    @Body() command: CreateAnswerUploadDto,
    @Req() request: Request,
  ) {
    return this.authoring.createUpload(p.classId, p.assessmentId, {
      ...command,
      trustedOrigin: request.get('origin'),
    });
  }
  @Get(':uploadId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: AnswerMediaUploadResponseDto })
  status(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ) {
    return this.authoring.upload(classId, assessmentId, uploadId, 'status');
  }
  @Post(':uploadId/complete')
  @Header('Cache-Control', 'private, no-store')
  @ApiCreatedResponse({ type: AnswerMediaUploadResponseDto })
  complete(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ) {
    return this.authoring.upload(classId, assessmentId, uploadId, 'complete');
  }
  @Post(':uploadId/cancel')
  @Header('Cache-Control', 'private, no-store')
  @ApiCreatedResponse({ type: AnswerMediaUploadResponseDto })
  cancel(
    @Param('classId', new ParseUUIDPipe()) classId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  ) {
    return this.authoring.upload(classId, assessmentId, uploadId, 'cancel');
  }
}
