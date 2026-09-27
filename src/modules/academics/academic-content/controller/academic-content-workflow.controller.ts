import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { SchoolManagementOnly } from '../../../../common/decorators/school-management-only.decorator';
import {
  ApproveAcademicContentUseCase,
  RequestAcademicContentChangesUseCase,
  SubmitAcademicContentUseCase,
} from '../application/academic-content-workflow.use-cases';
import {
  ListAcademicContentApprovalHistoryUseCase,
  ListAcademicContentReviewQueueUseCase,
} from '../application/academic-content-review.use-cases';
import { AcademicContentPaginationQueryDto } from '../dto/academic-content-request.dto';
import {
  AcademicContentApprovalHistoryResponseDto,
  AcademicContentReviewQueueQueryDto,
  AcademicContentReviewQueueResponseDto,
} from '../dto/academic-content-review.dto';
import {
  AcademicContentRequestChangesDto,
  AcademicContentTransitionResponseDto,
} from '../dto/academic-content-workflow.dto';
import { presentAcademicContentTransition } from '../presenters/academic-content.presenter';
import {
  presentAcademicContentApprovalHistory,
  presentAcademicContentReviewQueue,
} from '../presenters/academic-content-review.presenter';

@ApiTags('academics-academic-content')
@ApiBearerAuth()
@SchoolManagementOnly()
@Controller('academics/academic-content')
export class AcademicContentWorkflowController {
  constructor(
    private readonly submitContent: SubmitAcademicContentUseCase,
    private readonly approveContent: ApproveAcademicContentUseCase,
    private readonly requestChanges: RequestAcademicContentChangesUseCase,
    private readonly listReviewQueue: ListAcademicContentReviewQueueUseCase,
    private readonly listApprovalHistory: ListAcademicContentApprovalHistoryUseCase,
  ) {}

  @Get('review-queue')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @RequiredPermissions('academics.academic_content.approve')
  @ApiOperation({ summary: 'List current Teacher Preparation review requests' })
  @ApiOkResponse({ type: AcademicContentReviewQueueResponseDto })
  async reviewQueue(
    @Query() query: AcademicContentReviewQueueQueryDto,
  ): Promise<AcademicContentReviewQueueResponseDto> {
    return presentAcademicContentReviewQueue(
      await this.listReviewQueue.execute(query),
    );
  }

  @Get(':contentId/approvals')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @RequiredPermissions('academics.academic_content.view')
  @ApiOperation({ summary: 'List Academic Content approval history' })
  @ApiParam({ name: 'contentId', format: 'uuid' })
  @ApiOkResponse({ type: AcademicContentApprovalHistoryResponseDto })
  async approvals(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Query() query: AcademicContentPaginationQueryDto,
  ): Promise<AcademicContentApprovalHistoryResponseDto> {
    return presentAcademicContentApprovalHistory(
      await this.listApprovalHistory.execute(contentId, query),
    );
  }

  @Post(':contentId/submit')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('academics.academic_content.manage')
  @ApiOperation({
    summary: 'Submit or resubmit Teacher Preparation for review',
  })
  @ApiOkResponse({ type: AcademicContentTransitionResponseDto })
  submit(
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body() body: unknown,
  ): Promise<AcademicContentTransitionResponseDto> {
    return this.submitContent
      .execute(contentId, body)
      .then(presentAcademicContentTransition);
  }

  @Post(':contentId/approve')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('academics.academic_content.approve')
  @ApiOperation({ summary: 'Approve the current Teacher Preparation revision' })
  @ApiOkResponse({ type: AcademicContentTransitionResponseDto })
  approve(
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body() body: unknown,
  ): Promise<AcademicContentTransitionResponseDto> {
    return this.approveContent
      .execute(contentId, body)
      .then(presentAcademicContentTransition);
  }

  @Post(':contentId/request-changes')
  @HttpCode(HttpStatus.OK)
  @RequiredPermissions('academics.academic_content.approve')
  @ApiOperation({
    summary: 'Request changes to the current Teacher Preparation revision',
  })
  @ApiBody({ type: AcademicContentRequestChangesDto })
  @ApiOkResponse({ type: AcademicContentTransitionResponseDto })
  request(
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body() body: AcademicContentRequestChangesDto,
  ): Promise<AcademicContentTransitionResponseDto> {
    return this.requestChanges
      .execute(contentId, body)
      .then(presentAcademicContentTransition);
  }
}
