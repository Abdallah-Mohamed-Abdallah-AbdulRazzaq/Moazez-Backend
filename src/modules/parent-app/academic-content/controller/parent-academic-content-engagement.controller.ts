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
import { RecordParentAcademicContentEngagementUseCase } from '../application/parent-academic-content.use-cases';

@ApiTags('parent-app')
@ApiBearerAuth()
@UseFilters(AcademicContentEngagementExceptionFilter)
@Controller('parent')
export class ParentAcademicContentEngagementController {
  constructor(
    private readonly recordEvent: RecordParentAcademicContentEngagementUseCase,
  ) {}

  @Post('children/:studentId/academic-content/:contentId/engagement-events')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store, private, max-age=0')
  @RequiredPermissions('academics.academic_content.view')
  @ApiOkResponse({ type: AcademicContentEngagementResponseDto })
  record(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('contentId', new ParseUUIDPipe()) contentId: string,
    @Body() body: RecordAcademicContentEngagementDto,
  ): Promise<AcademicContentEngagementResponseDto> {
    return this.recordEvent.execute(studentId, contentId, body);
  }
}
