import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  GetStudentHomeworkUseCase,
  ListStudentHomeworksUseCase,
} from '../application/student-homeworks.use-cases';
import {
  StudentHomeworkResponseDto,
  StudentHomeworksListResponseDto,
  StudentHomeworksQueryDto,
} from '../dto/student-homeworks.dto';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/homeworks')
export class StudentHomeworksController {
  constructor(
    private readonly listStudentHomeworksUseCase: ListStudentHomeworksUseCase,
    private readonly getStudentHomeworkUseCase: GetStudentHomeworkUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List homework assigned to the current student' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'mode', required: false })
  @ApiQuery({ name: 'dueFrom', required: false })
  @ApiQuery({ name: 'dueTo', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse({ type: StudentHomeworksListResponseDto })
  listHomeworks(
    @Query() query: StudentHomeworksQueryDto,
  ): Promise<StudentHomeworksListResponseDto> {
    return this.listStudentHomeworksUseCase.execute(query);
  }

  @Get(':homeworkId')
  @ApiOperation({ summary: 'Get assigned homework details' })
  @ApiParam({ name: 'homeworkId' })
  @ApiOkResponse({ type: StudentHomeworkResponseDto })
  getHomework(
    @Param('homeworkId', new ParseUUIDPipe()) homeworkId: string,
  ): Promise<StudentHomeworkResponseDto> {
    return this.getStudentHomeworkUseCase.execute(homeworkId);
  }
}
