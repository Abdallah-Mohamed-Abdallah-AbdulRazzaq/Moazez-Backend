import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { ListStudentSubjectLessonsUseCase } from '../application/list-student-subject-lessons.use-case';
import { StudentSubjectLessonsQueryDto } from '../dto/student-subject-lessons.dto';
import { StudentSubjectLessonsResponseDto } from '../dto/student-subject-lessons-response.dto';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/subjects')
export class StudentSubjectLessonsController {
  constructor(
    private readonly listStudentSubjectLessonsUseCase: ListStudentSubjectLessonsUseCase,
  ) {}

  @Get(':subjectId/lessons')
  @ApiOperation({ summary: 'List visible lessons for a Student Subject' })
  @ApiOkResponse({ type: StudentSubjectLessonsResponseDto })
  @RequiredPermissions('academics.subjects.view', 'academics.lesson_plans.view')
  listLessons(
    @Param('subjectId', new ParseUUIDPipe()) subjectId: string,
    @Query() query: StudentSubjectLessonsQueryDto,
  ): Promise<StudentSubjectLessonsResponseDto> {
    return this.listStudentSubjectLessonsUseCase.execute({ subjectId, query });
  }
}
