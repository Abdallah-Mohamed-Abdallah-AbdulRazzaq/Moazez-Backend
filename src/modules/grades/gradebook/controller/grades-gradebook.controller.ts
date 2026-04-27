import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import { GetGradesGradebookUseCase } from '../application/get-grades-gradebook.use-case';
import { GetStudentGradeSnapshotUseCase } from '../application/get-student-grade-snapshot.use-case';
import {
  GetGradebookQueryDto,
  GradebookResponseDto,
} from '../dto/get-gradebook-query.dto';
import {
  GetStudentGradeSnapshotQueryDto,
  StudentGradeSnapshotResponseDto,
} from '../dto/get-student-grade-snapshot-query.dto';

@ApiTags('grades-gradebook')
@ApiBearerAuth()
@Controller('grades')
export class GradesGradebookController {
  constructor(
    private readonly getGradesGradebookUseCase: GetGradesGradebookUseCase,
    private readonly getStudentGradeSnapshotUseCase: GetStudentGradeSnapshotUseCase,
  ) {}

  @Get('gradebook')
  @RequiredPermissions('grades.gradebook.view')
  getGradebook(
    @Query() query: GetGradebookQueryDto,
  ): Promise<GradebookResponseDto> {
    return this.getGradesGradebookUseCase.execute(query);
  }

  @Get('students/:studentId/snapshot')
  @RequiredPermissions('grades.snapshots.view')
  getStudentSnapshot(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: GetStudentGradeSnapshotQueryDto,
  ): Promise<StudentGradeSnapshotResponseDto> {
    return this.getStudentGradeSnapshotUseCase.execute(studentId, query);
  }
}
