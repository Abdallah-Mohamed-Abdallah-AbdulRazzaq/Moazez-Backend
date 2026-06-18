import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  DisciplineDerivedQueryDto,
  ParentDisciplineSummaryResponseDto,
  ParentDisciplineTimelineListResponseDto,
} from '../../../discipline/dto/discipline-derived.dto';
import { GetParentChildDisciplineSummaryUseCase } from '../application/get-parent-child-discipline-summary.use-case';
import { ListParentChildDisciplineUseCase } from '../application/list-parent-child-discipline.use-case';

@ApiTags('parent-app')
@ApiBearerAuth()
@Controller('parent/children/:studentId/discipline')
export class ParentDisciplineController {
  constructor(
    private readonly listParentChildDisciplineUseCase: ListParentChildDisciplineUseCase,
    private readonly getParentChildDisciplineSummaryUseCase: GetParentChildDisciplineSummaryUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: ParentDisciplineTimelineListResponseDto })
  listDiscipline(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: DisciplineDerivedQueryDto,
  ): Promise<ParentDisciplineTimelineListResponseDto> {
    return this.listParentChildDisciplineUseCase.execute(studentId, query);
  }

  @Get('summary')
  @ApiOkResponse({ type: ParentDisciplineSummaryResponseDto })
  getDisciplineSummary(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: DisciplineDerivedQueryDto,
  ): Promise<ParentDisciplineSummaryResponseDto> {
    return this.getParentChildDisciplineSummaryUseCase.execute(
      studentId,
      query,
    );
  }
}
