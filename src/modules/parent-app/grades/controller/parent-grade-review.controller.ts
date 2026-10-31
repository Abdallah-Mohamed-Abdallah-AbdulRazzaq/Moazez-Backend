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
import { ParentGradeReviewService } from '../application/parent-grade-review.service';
@ApiTags('parent-grade-review')
@ApiBearerAuth()
@UseGuards(answerMediaSurfaceGuard('PARENT'))
@RequiredPermissions('grades.assessments.view')
@ApiResponse({
  status: 404,
  description: 'Unavailable, unauthorized, unreleased or revoked resource',
})
@Controller(
  'parent/children/:studentId/grades/assessments/:assessmentId/review',
)
export class ParentGradeReviewController {
  constructor(private readonly reviews: ParentGradeReviewService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: GradeReleasedReviewResponseDto })
  read(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
  ) {
    return this.reviews.read(studentId, assessmentId, false);
  }
  @Get('assets')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: GradeAssetsResponseDto })
  assessmentAssets(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
  ) {
    return this.reviews.paperAssets(studentId, { assessmentId }, false);
  }
  @Get('questions/:questionId/assets')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: GradeAssetsResponseDto })
  questionAssets(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ) {
    return this.reviews.paperAssets(
      studentId,
      { assessmentId, questionId },
      false,
    );
  }
  @Get('submissions/:submissionId/questions/:questionId/answer-assets')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: AnswerMediaAssetsResponseDto })
  answerAssets(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ) {
    return this.reviews.answerAssets(
      studentId,
      { assessmentId, submissionId, questionId },
      false,
    );
  }
  @Get('assets/:assetId/preview')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async getPaperpreview(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openPaper(
      studentId,
      { assessmentId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
      false,
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }
  @Head('assets/:assetId/preview')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async headPaperpreview(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openPaper(
      studentId,
      { assessmentId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
      false,
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }
  @Get('assets/:assetId/download')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async getPaperdownload(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openPaper(
      studentId,
      { assessmentId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
      false,
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
  @Head('assets/:assetId/download')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async headPaperdownload(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openPaper(
      studentId,
      { assessmentId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
      false,
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
  @Get('questions/:questionId/assets/:assetId/preview')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async getQuestionpreview(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openPaper(
      studentId,
      { assessmentId, questionId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
      false,
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }
  @Head('questions/:questionId/assets/:assetId/preview')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async headQuestionpreview(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openPaper(
      studentId,
      { assessmentId, questionId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
      false,
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }
  @Get('questions/:questionId/assets/:assetId/download')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async getQuestiondownload(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openPaper(
      studentId,
      { assessmentId, questionId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
      false,
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
  @Head('questions/:questionId/assets/:assetId/download')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async headQuestiondownload(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openPaper(
      studentId,
      { assessmentId, questionId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
      false,
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
  @Get('groups/:groupId/assets/:assetId/preview')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async getGrouppreview(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openGroup(
      studentId,
      { assessmentId, groupId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
      false,
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }
  @Head('groups/:groupId/assets/:assetId/preview')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async headGrouppreview(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openGroup(
      studentId,
      { assessmentId, groupId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
      false,
    );
    await streamPrivateMediaContent(content, response, 'inline');
  }
  @Get('groups/:groupId/assets/:assetId/download')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async getGroupdownload(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openGroup(
      studentId,
      { assessmentId, groupId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
      false,
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
  @Head('groups/:groupId/assets/:assetId/download')
  @ApiHeader({ name: 'Range', required: false })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 206 })
  @ApiResponse({ status: 416 })
  async headGroupdownload(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openGroup(
      studentId,
      { assessmentId, groupId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
      false,
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
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openAnswer(
      studentId,
      { assessmentId, submissionId, questionId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
      false,
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
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openAnswer(
      studentId,
      { assessmentId, submissionId, questionId, assetId },
      privateMediaContentRequest(request, response, 'inline'),
      false,
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
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openAnswer(
      studentId,
      { assessmentId, submissionId, questionId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
      false,
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
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Param('assetId', new ParseUUIDPipe()) assetId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const content = await this.reviews.openAnswer(
      studentId,
      { assessmentId, submissionId, questionId, assetId },
      privateMediaContentRequest(request, response, 'attachment'),
      false,
    );
    await streamPrivateMediaContent(content, response, 'attachment');
  }
}
