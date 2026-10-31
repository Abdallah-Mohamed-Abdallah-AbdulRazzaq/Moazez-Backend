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
  ApiHeader,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import {
  privateMediaContentRequest,
  streamPrivateMediaContent,
} from '../../../../infrastructure/storage/private-media-content.response';
import { answerMediaSurfaceGuard } from '../../../files/assessment-media/application/answer-media-surface.guard';
import { GradeReleasedReviewResponseDto } from '../../../grades/assessments/dto/grade-review.dto';
import { GradeAssetsResponseDto } from '../../../grades/assessments/dto/grade-asset.dto';
import { AnswerMediaAssetsResponseDto } from '../../../files/assessment-media/dto/answer-media.dto';
import { StudentGradeReviewService } from '../application/student-grade-review.service';
@ApiTags('student-grade-review')
@ApiBearerAuth()
@UseGuards(answerMediaSurfaceGuard('STUDENT'))
@RequiredPermissions('grades.assessments.view')
@ApiResponse({
  status: 404,
  description: 'Unavailable, unauthorized, unreleased or revoked resource',
})
@Controller('student/exams/:assessmentId/review')
export class StudentExamReviewController {
  constructor(private readonly reviews: StudentGradeReviewService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: GradeReleasedReviewResponseDto })
  read(@Param('assessmentId', new ParseUUIDPipe()) assessmentId: string) {
    return this.reviews.read(assessmentId, true);
  }
  @Get('assets')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: GradeAssetsResponseDto })
  assessmentAssets(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
  ) {
    return this.reviews.paperAssets({ assessmentId }, true);
  }
  @Get('questions/:questionId/assets')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: GradeAssetsResponseDto })
  questionAssets(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ) {
    return this.reviews.paperAssets({ assessmentId, questionId }, true);
  }
  @Get('submissions/:submissionId/questions/:questionId/answer-assets')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: AnswerMediaAssetsResponseDto })
  answerAssets(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ) {
    return this.reviews.answerAssets(
      { assessmentId, submissionId, questionId },
      true,
    );
  }
  @Get('assets/:assetId/preview')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async getPaperpreview(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openPaper(
      { assessmentId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
      true,
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }
  @Head('assets/:assetId/preview')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async headPaperpreview(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openPaper(
      { assessmentId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
      true,
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }
  @Get('assets/:assetId/download')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async getPaperdownload(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openPaper(
      { assessmentId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
      true,
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
  @Head('assets/:assetId/download')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async headPaperdownload(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openPaper(
      { assessmentId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
      true,
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
  @Get('questions/:questionId/assets/:assetId/preview')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async getQuestionpreview(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openPaper(
      { assessmentId, questionId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
      true,
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }
  @Head('questions/:questionId/assets/:assetId/preview')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async headQuestionpreview(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openPaper(
      { assessmentId, questionId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
      true,
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }
  @Get('questions/:questionId/assets/:assetId/download')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async getQuestiondownload(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openPaper(
      { assessmentId, questionId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
      true,
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
  @Head('questions/:questionId/assets/:assetId/download')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async headQuestiondownload(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openPaper(
      { assessmentId, questionId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
      true,
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
  @Get('groups/:groupId/assets/:assetId/preview')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async getGrouppreview(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openGroup(
      { assessmentId, groupId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
      true,
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }
  @Head('groups/:groupId/assets/:assetId/preview')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async headGrouppreview(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openGroup(
      { assessmentId, groupId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
      true,
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }
  @Get('groups/:groupId/assets/:assetId/download')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async getGroupdownload(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openGroup(
      { assessmentId, groupId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
      true,
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
  @Head('groups/:groupId/assets/:assetId/download')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async headGroupdownload(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openGroup(
      { assessmentId, groupId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
      true,
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
  @Get(
    'submissions/:submissionId/questions/:questionId/answer-assets/:assetId/preview',
  )
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async getAnswerpreview(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openAnswer(
      { assessmentId, submissionId, questionId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
      true,
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }
  @Head(
    'submissions/:submissionId/questions/:questionId/answer-assets/:assetId/preview',
  )
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async headAnswerpreview(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openAnswer(
      { assessmentId, submissionId, questionId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
      true,
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }
  @Get(
    'submissions/:submissionId/questions/:questionId/answer-assets/:assetId/download',
  )
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async getAnswerdownload(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openAnswer(
      { assessmentId, submissionId, questionId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
      true,
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
  @Head(
    'submissions/:submissionId/questions/:questionId/answer-assets/:assetId/download',
  )
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async headAnswerdownload(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openAnswer(
      { assessmentId, submissionId, questionId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
      true,
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
}
