import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  UseFilters,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { AcademicContentEngagementExceptionFilter } from '../../../academics/academic-content/controller/academic-content-engagement-exception.filter';
import { ACADEMIC_CONTENT_OWN_ANALYTICS_PERMISSIONS } from '../../../academics/academic-content/domain/academic-content-analytics.contract';
import { TeacherAcademicContentAnalyticsUseCase } from '../application/teacher-academic-content-analytics.use-case';
import {
  TeacherAcademicContentAnalyticsQueryDto,
  TeacherAcademicContentAnalyticsResponseDto,
} from '../dto/teacher-academic-content-analytics.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@UseFilters(AcademicContentEngagementExceptionFilter)
@Controller('teacher/academic-content')
export class TeacherAcademicContentAnalyticsController {
  constructor(
    private readonly analytics: TeacherAcademicContentAnalyticsUseCase,
  ) {}

  @Get(':contentId/analytics')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @RequiredPermissions(...ACADEMIC_CONTENT_OWN_ANALYTICS_PERMISSIONS)
  @ApiOkResponse({ type: TeacherAcademicContentAnalyticsResponseDto })
  content(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Query() query: TeacherAcademicContentAnalyticsQueryDto,
  ) {
    return this.analytics.execute(contentId, query);
  }

  @Get(':contentId/publications/:publicationId/analytics')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @RequiredPermissions(...ACADEMIC_CONTENT_OWN_ANALYTICS_PERMISSIONS)
  @ApiOkResponse({ type: TeacherAcademicContentAnalyticsResponseDto })
  publication(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Param('publicationId', new ParseUUIDPipe()) publicationId: string,
    @Query() query: TeacherAcademicContentAnalyticsQueryDto,
  ) {
    return this.analytics.execute(contentId, query, publicationId);
  }
}
