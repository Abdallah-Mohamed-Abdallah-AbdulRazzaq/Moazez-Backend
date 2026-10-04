import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import {
  GetTeacherAcademicContentCapabilitiesUseCase,
  GetTeacherAcademicContentUseCase,
  ListTeacherAcademicContentUseCase,
} from '../application/teacher-academic-content-read.use-cases';
import {
  ListTeacherAcademicContentQueryDto,
  TeacherAcademicContentCapabilitiesDto,
  TeacherAcademicContentDetailDto,
} from '../dto/teacher-academic-content.dto';
import { AcademicContentListResponseDto } from '../../../academics/academic-content/dto/academic-content-response.dto';

@ApiTags('teacher-app')
@ApiBearerAuth()
@Controller('teacher/academic-content')
export class TeacherAcademicContentController {
  constructor(
    private readonly getCapabilities: GetTeacherAcademicContentCapabilitiesUseCase,
    private readonly listContent: ListTeacherAcademicContentUseCase,
    private readonly getContent: GetTeacherAcademicContentUseCase,
  ) {}

  @Get('capabilities')
  @RequiredPermissions('academics.academic_content.view')
  @ApiOkResponse({ type: TeacherAcademicContentCapabilitiesDto })
  capabilities(): Promise<TeacherAcademicContentCapabilitiesDto> {
    return this.getCapabilities.execute();
  }

  @Get()
  @RequiredPermissions('academics.academic_content.view')
  @ApiOkResponse({ type: AcademicContentListResponseDto })
  list(
    @Query() query: ListTeacherAcademicContentQueryDto,
  ): Promise<AcademicContentListResponseDto> {
    return this.listContent.execute(query);
  }

  @Get(':contentId')
  @RequiredPermissions('academics.academic_content.view')
  @ApiOkResponse({ type: TeacherAcademicContentDetailDto })
  detail(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
  ): Promise<TeacherAcademicContentDetailDto> {
    return this.getContent.execute(contentId);
  }
}
