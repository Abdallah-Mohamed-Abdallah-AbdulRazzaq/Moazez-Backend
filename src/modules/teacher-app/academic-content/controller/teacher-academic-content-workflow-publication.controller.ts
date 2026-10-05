import {
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  Query,
  Body,
  Header,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { TeacherAcademicContentWorkflowPublicationUseCases } from '../application/teacher-academic-content-workflow-publication.use-cases';
import { TeacherAcademicContentApprovalHistoryDto } from '../dto/teacher-academic-content-workflow.dto';
import { AcademicContentPaginationQueryDto } from '../../../academics/academic-content/dto/academic-content-request.dto';
import {
  AcademicContentRevisionListDto,
  AcademicContentRevisionDetailDto,
} from '../../../academics/academic-content/dto/academic-content-revision-response.dto';
import {
  AcademicContentEmptyWorkflowBodyDto,
  AcademicContentTransitionResponseDto,
} from '../../../academics/academic-content/dto/academic-content-workflow.dto';
import {
  CreateAcademicContentPublicationDto,
  AcademicContentEmptyPublicationBodyDto,
  AcademicContentPublicationHistoryQueryDto,
  AcademicContentPublicationHistoryResponseDto,
  AcademicContentPublicationReadinessResponseDto,
  AcademicContentAudiencePreviewResponseDto,
  AcademicContentPublicationResponseDto,
  AcademicContentPublicationRevisionStartResponseDto,
} from '../../../academics/academic-content/dto/academic-content-publication.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher/academic-content')
export class TeacherAcademicContentWorkflowPublicationController {
  constructor(
    private readonly operations: TeacherAcademicContentWorkflowPublicationUseCases,
  ) {}

  @Get(':contentId/revisions')
  @RequiredPermissions('academics.academic_content.view')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @ApiOkResponse({ type: AcademicContentRevisionListDto })
  revisions(
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Query() query: AcademicContentPaginationQueryDto,
  ): Promise<AcademicContentRevisionListDto> {
    return this.operations.revisions(contentId, query);
  }

  @Get(':contentId/revisions/:revisionId')
  @RequiredPermissions('academics.academic_content.view')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @ApiOkResponse({ type: AcademicContentRevisionDetailDto })
  revision(
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
  ): Promise<AcademicContentRevisionDetailDto> {
    return this.operations.revision(contentId, revisionId);
  }

  @Post(':contentId/submit')
  @RequiredPermissions('academics.academic_content.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AcademicContentTransitionResponseDto })
  submit(
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body() body: AcademicContentEmptyWorkflowBodyDto,
  ): Promise<AcademicContentTransitionResponseDto> {
    return this.operations.submit(contentId, body);
  }

  @Get(':contentId/approvals')
  @RequiredPermissions('academics.academic_content.view')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @ApiOkResponse({ type: TeacherAcademicContentApprovalHistoryDto })
  approvals(
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Query() query: AcademicContentPaginationQueryDto,
  ): Promise<TeacherAcademicContentApprovalHistoryDto> {
    return this.operations.approvals(contentId, query);
  }

  @Get(':contentId/publication-readiness')
  @RequiredPermissions('academics.academic_content.view')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @ApiOkResponse({ type: AcademicContentPublicationReadinessResponseDto })
  publicationReadiness(
    @Param('contentId', ParseUUIDPipe) contentId: string,
  ): Promise<AcademicContentPublicationReadinessResponseDto> {
    return this.operations.publicationReadiness(contentId);
  }

  @Get(':contentId/audience-preview')
  @RequiredPermissions('academics.academic_content.view')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @ApiOkResponse({ type: AcademicContentAudiencePreviewResponseDto })
  audiencePreview(
    @Param('contentId', ParseUUIDPipe) contentId: string,
  ): Promise<AcademicContentAudiencePreviewResponseDto> {
    return this.operations.audiencePreview(contentId);
  }

  @Get(':contentId/publications')
  @RequiredPermissions('academics.academic_content.view')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @ApiOkResponse({ type: AcademicContentPublicationHistoryResponseDto })
  publications(
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Query() query: AcademicContentPublicationHistoryQueryDto,
  ): Promise<AcademicContentPublicationHistoryResponseDto> {
    return this.operations.publications(contentId, query);
  }

  @Get(':contentId/publications/:publicationId')
  @RequiredPermissions('academics.academic_content.view')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @ApiOkResponse({ type: AcademicContentPublicationResponseDto })
  publication(
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Param('publicationId', ParseUUIDPipe) publicationId: string,
  ): Promise<AcademicContentPublicationResponseDto> {
    return this.operations.publication(contentId, publicationId);
  }

  @Post(':contentId/publications')
  @RequiredPermissions('academics.academic_content.publish')
  @ApiCreatedResponse({ type: AcademicContentPublicationResponseDto })
  publish(
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body() dto: CreateAcademicContentPublicationDto,
  ): Promise<AcademicContentPublicationResponseDto> {
    return this.operations.publish(contentId, {
      clientRequestId: dto.clientRequestId,
      ...(dto.notifyMinorUpdate === undefined
        ? {}
        : { notifyMinorUpdate: dto.notifyMinorUpdate }),
      ...(dto.publishAt === undefined
        ? {}
        : { publishAt: new Date(dto.publishAt) }),
      ...(dto.visibleFrom === undefined
        ? {}
        : { visibleFrom: new Date(dto.visibleFrom) }),
      ...(dto.visibleUntil === undefined
        ? {}
        : {
            visibleUntil:
              dto.visibleUntil === null ? null : new Date(dto.visibleUntil),
          }),
    });
  }

  @Post(':contentId/publications/:publicationId/unschedule')
  @RequiredPermissions('academics.academic_content.publish')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AcademicContentPublicationResponseDto })
  unschedule(
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Param('publicationId', ParseUUIDPipe) publicationId: string,
    @Body() body: AcademicContentEmptyPublicationBodyDto,
  ): Promise<AcademicContentPublicationResponseDto> {
    return this.operations.unschedule(contentId, publicationId, body);
  }

  @Post(':contentId/publications/:publicationId/cancel')
  @RequiredPermissions('academics.academic_content.publish')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AcademicContentPublicationResponseDto })
  withdraw(
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Param('publicationId', ParseUUIDPipe) publicationId: string,
    @Body() body: AcademicContentEmptyPublicationBodyDto,
  ): Promise<AcademicContentPublicationResponseDto> {
    return this.operations.withdraw(contentId, publicationId, body);
  }

  @Post(':contentId/publications/:publicationId/revise')
  @RequiredPermissions(
    'academics.academic_content.manage',
    'academics.academic_content.publish',
  )
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AcademicContentPublicationRevisionStartResponseDto })
  revise(
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Param('publicationId', ParseUUIDPipe) publicationId: string,
    @Body() body: AcademicContentEmptyPublicationBodyDto,
  ): Promise<AcademicContentPublicationRevisionStartResponseDto> {
    return this.operations.revise(contentId, publicationId, body);
  }
}
