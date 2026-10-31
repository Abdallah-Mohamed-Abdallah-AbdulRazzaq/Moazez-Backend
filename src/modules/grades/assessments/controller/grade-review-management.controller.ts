import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { answerMediaSurfaceGuard } from '../../../files/assessment-media/application/answer-media-surface.guard';
import { GradeReviewService } from '../application/grade-review.service';
import {
  ApproveGradeKeyDto,
  GradeKeyApprovalResponseDto,
  GradeReviewReleaseResponseDto,
  RevokeGradeKeyDto,
  SetGradeReviewReleaseDto,
} from '../dto/grade-review.dto';

@ApiTags('grades-review-policy')
@ApiBearerAuth()
@UseGuards(answerMediaSurfaceGuard('SCHOOL_USER', 'ORGANIZATION_USER'))
@Controller('grades/assessments/:assessmentId')
export class GradeReviewManagementController {
  constructor(private readonly reviews: GradeReviewService) {}
  @Get('review-release')
  @Header('Cache-Control', 'private, no-store')
  @RequiredPermissions('grades.assessments.approve')
  @ApiOkResponse({ type: GradeReviewReleaseResponseDto })
  policy(@Param('assessmentId', new ParseUUIDPipe()) assessmentId: string) {
    return this.reviews.policy(assessmentId);
  }
  @Put('review-release')
  @Header('Cache-Control', 'private, no-store')
  @RequiredPermissions('grades.assessments.approve')
  @ApiOkResponse({ type: GradeReviewReleaseResponseDto })
  release(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Body() command: SetGradeReviewReleaseDto,
  ) {
    return this.reviews.setPolicy(assessmentId, command);
  }
  @Post('questions/:questionId/key-approval')
  @RequiredPermissions('grades.questions.manage', 'grades.assessments.approve')
  @ApiCreatedResponse({ type: GradeKeyApprovalResponseDto })
  approve(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() command: ApproveGradeKeyDto,
  ) {
    return this.reviews.approveKey(
      assessmentId,
      questionId,
      command.expectedQuestionUpdatedAt,
    );
  }
  @Post('questions/:questionId/key-approval/revoke')
  @RequiredPermissions('grades.questions.manage', 'grades.assessments.approve')
  @ApiCreatedResponse({ type: GradeKeyApprovalResponseDto })
  revoke(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() command: RevokeGradeKeyDto,
  ) {
    return this.reviews.revokeKey(assessmentId, questionId, command.approvalId);
  }
}
