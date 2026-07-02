import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import {
  GetParentChildHomeworkUseCase,
  ListParentChildHomeworksUseCase,
} from '../application/parent-homeworks.use-cases';
import {
  ParentHomeworkResponseDto,
  ParentHomeworksListResponseDto,
  ParentHomeworksQueryDto,
} from '../dto/parent-homeworks.dto';

@ApiTags('parent-app')
@ApiBearerAuth()
@Controller('parent/children/:studentId/homeworks')
export class ParentHomeworksController {
  constructor(
    private readonly listParentChildHomeworksUseCase: ListParentChildHomeworksUseCase,
    private readonly getParentChildHomeworkUseCase: GetParentChildHomeworkUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List visible homework for an owned child' })
  @ApiParam({ name: 'studentId', description: 'Owned child student id.' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'mode', required: false })
  @ApiQuery({ name: 'dueFrom', required: false })
  @ApiQuery({ name: 'dueTo', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse({ type: ParentHomeworksListResponseDto })
  @RequiredPermissions('homework.assignments.view')
  listHomeworks(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: ParentHomeworksQueryDto,
  ): Promise<ParentHomeworksListResponseDto> {
    return this.listParentChildHomeworksUseCase.execute(studentId, query);
  }

  @Get(':homeworkId')
  @ApiOperation({ summary: 'Get visible homework detail for an owned child' })
  @ApiParam({ name: 'studentId', description: 'Owned child student id.' })
  @ApiParam({ name: 'homeworkId', format: 'uuid' })
  @ApiOkResponse({ type: ParentHomeworkResponseDto })
  @RequiredPermissions('homework.assignments.view', 'homework.submissions.view')
  getHomework(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
  ): Promise<ParentHomeworkResponseDto> {
    return this.getParentChildHomeworkUseCase.execute(studentId, homeworkId);
  }
}
