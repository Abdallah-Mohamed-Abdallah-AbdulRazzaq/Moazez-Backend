import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { GetStudentSubjectUseCase } from '../application/get-student-subject.use-case';
import { ListStudentSubjectsUseCase } from '../application/list-student-subjects.use-case';
import {
  StudentSubjectDetailResponseDto,
  StudentSubjectsListResponseDto,
} from '../dto/student-subjects.dto';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/subjects')
export class StudentSubjectsController {
  constructor(
    private readonly listStudentSubjectsUseCase: ListStudentSubjectsUseCase,
    private readonly getStudentSubjectUseCase: GetStudentSubjectUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: StudentSubjectsListResponseDto })
  listSubjects(): Promise<StudentSubjectsListResponseDto> {
    return this.listStudentSubjectsUseCase.execute();
  }

  @Get(':subjectId')
  @ApiOkResponse({ type: StudentSubjectDetailResponseDto })
  getSubject(
    @Param('subjectId', new ParseUUIDPipe()) subjectId: string,
  ): Promise<StudentSubjectDetailResponseDto> {
    return this.getStudentSubjectUseCase.execute(subjectId);
  }
}
