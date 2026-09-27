import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
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
  AcademicContentRequestChangesDto,
  AcademicContentTransitionResponseDto,
} from '../dto/academic-content-workflow.dto';
import { presentAcademicContentTransition } from '../presenters/academic-content.presenter';

@ApiTags('academics-academic-content')
@ApiBearerAuth()
@SchoolManagementOnly()
@Controller('academics/academic-content')
export class AcademicContentWorkflowController {
  constructor(
    private readonly submitContent: SubmitAcademicContentUseCase,
    private readonly approveContent: ApproveAcademicContentUseCase,
    private readonly requestChanges: RequestAcademicContentChangesUseCase,
  ) {}

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
