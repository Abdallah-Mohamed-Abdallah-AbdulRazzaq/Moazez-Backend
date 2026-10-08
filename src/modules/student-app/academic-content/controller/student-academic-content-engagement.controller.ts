import {
  Body,
  Controller,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseFilters,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { AcademicContentEngagementExceptionFilter } from '../../../academics/academic-content/controller/academic-content-engagement-exception.filter';
import {
  AcademicContentEngagementResponseDto,
  RecordAcademicContentEngagementDto,
} from '../../../academics/academic-content/dto/academic-content-engagement.dto';
import { RecordStudentAcademicContentEngagementUseCase } from '../application/student-academic-content.use-cases';

@ApiTags('student-app')
@ApiBearerAuth()
@UseFilters(AcademicContentEngagementExceptionFilter)
@Controller('student/academic-content')
export class StudentAcademicContentEngagementController {
  constructor(
    private readonly recordEvent: RecordStudentAcademicContentEngagementUseCase,
  ) {}

  @Post(':contentId/engagement-events')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @RequiredPermissions('academics.academic_content.view')
  @ApiOkResponse({ type: AcademicContentEngagementResponseDto })
  record(
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Body() body: RecordAcademicContentEngagementDto,
  ): Promise<AcademicContentEngagementResponseDto> {
    return this.recordEvent.execute(contentId, body);
  }
}
