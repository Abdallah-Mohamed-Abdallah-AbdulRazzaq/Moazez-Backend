import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequiredPermissions } from '../../../../common/decorators/required-permissions.decorator';
import {
  DisciplineDerivedQueryDto,
  DisciplineSummaryResponseDto,
  DisciplineTimelineListResponseDto,
} from '../../../discipline/dto/discipline-derived.dto';
import { GetStudentDisciplineSummaryUseCase } from '../application/get-student-discipline-summary.use-case';
import { ListStudentDisciplineUseCase } from '../application/list-student-discipline.use-case';

@ApiTags('student-app')
@ApiBearerAuth()
@Controller('student/discipline')
export class StudentDisciplineController {
  constructor(
    private readonly listStudentDisciplineUseCase: ListStudentDisciplineUseCase,
    private readonly getStudentDisciplineSummaryUseCase: GetStudentDisciplineSummaryUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: DisciplineTimelineListResponseDto })
  @RequiredPermissions('discipline.timeline.view')
  listDiscipline(
    @Query() query: DisciplineDerivedQueryDto,
  ): Promise<DisciplineTimelineListResponseDto> {
    return this.listStudentDisciplineUseCase.execute(query);
  }

  @Get('summary')
  @ApiOkResponse({ type: DisciplineSummaryResponseDto })
  @RequiredPermissions('discipline.timeline.view')
  getDisciplineSummary(
    @Query() query: DisciplineDerivedQueryDto,
  ): Promise<DisciplineSummaryResponseDto> {
    return this.getStudentDisciplineSummaryUseCase.execute(query);
  }
}
