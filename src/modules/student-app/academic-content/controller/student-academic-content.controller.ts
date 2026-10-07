import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import {
  GetStudentAcademicContentUseCase,
  ListStudentAcademicContentUseCase,
} from '../application/student-academic-content.use-cases';
import { StudentAcademicContentQueryDto } from '../dto/student-academic-content-query.dto';
import {
  StudentAcademicContentDetailResponseDto,
  StudentAcademicContentListResponseDto,
} from '../dto/student-academic-content-response.dto';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/academic-content')
export class StudentAcademicContentController {
  constructor(
    private readonly listContent: ListStudentAcademicContentUseCase,
    private readonly getContent: GetStudentAcademicContentUseCase,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @RequiredPermissions('academics.academic_content.view')
  @ApiOkResponse({ type: StudentAcademicContentListResponseDto })
  list(
    @Query() query: StudentAcademicContentQueryDto,
  ): Promise<StudentAcademicContentListResponseDto> {
    return this.listContent.execute(query);
  }

  @Get(':contentId')
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @RequiredPermissions('academics.academic_content.view')
  @ApiOkResponse({ type: StudentAcademicContentDetailResponseDto })
  detail(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
  ): Promise<StudentAcademicContentDetailResponseDto> {
    return this.getContent.execute(contentId);
  }
}
